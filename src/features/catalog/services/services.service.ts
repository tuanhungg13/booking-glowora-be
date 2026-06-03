import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LogType, Prisma, ServiceStatus, StaffStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CloudinaryService } from '../../../cloudinary/cloudinary.service';
import { SystemLogService } from '../../../system-log/system-log.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateServiceVariantDto, UpdateServiceVariantDto } from './dto/service-variant.dto';

type ServiceParams = { storeId?: string; status?: ServiceStatus; categoryId?: string; sort?: 'name' | 'name-desc' | 'price' | 'price-desc' | 'avgRating' | 'avgRating-asc'; page?: number; limit?: number };
type PublicServiceParams = { storeId?: string; categoryId?: string; q?: string; minPrice?: number; maxPrice?: number; minRating?: number; maxRating?: number; sort?: 'avgRating' | 'price' | 'price-desc' | 'newest' | 'popular'; page?: number; limit?: number };

const serviceInclude = {
  category: true,
  variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' as const } },
  staffs: { include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } } } },
  store: { select: { id: true, name: true, slug: true, address: true, logoUrl: true, latitude: true, longitude: true } },
} as const;

function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const MAX_IMAGES = 5;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly systemLog: SystemLogService,
  ) {}

  private async checkDuplicateName(name: string, storeId: string, excludeId?: string) {
    const existing = await this.prisma.service.findFirst({
      where: {
        storeId,
        name: { equals: name },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (existing) throw new BadRequestException(`Dịch vụ "${name}" đã tồn tại trong cửa hàng`);
  }

  async create(storeId: string, dto: CreateServiceDto, actorId: string) {
    await this.checkDuplicateName(dto.name, storeId);
    const slug = await this.generateUniqueSlug(dto.name, storeId);
    const service = await this.prisma.service.create({
      data: {
        storeId,
        name: dto.name,
        slug,
        description: dto.description,
        status: dto.status ?? ServiceStatus.ACTIVE,
        categoryId: dto.categoryId,
        variants: {
          create: dto.variants.map((v, i) => ({
            name: v.name,
            description: v.description,
            duration: v.duration,
            price: v.price,
            costPrice: v.costPrice,
            sortOrder: v.sortOrder ?? i,
            status: v.status ?? ServiceStatus.ACTIVE,
          })),
        },
      },
      include: serviceInclude,
    });

    this.systemLog.log({
      type: LogType.SERVICE_CREATED,
      actorId,
      storeId,
      targetId: service.id,
      targetType: 'Service',
      metadata: { name: service.name },
    });

    return service;
  }

  async findAll(params?: ServiceParams) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const where: Prisma.ServiceWhereInput = {
      ...(params?.storeId && { storeId: params.storeId }),
      ...(params?.status && { status: params.status }),
      ...(params?.categoryId && { categoryId: params.categoryId }),
    };

    if (params?.sort === 'price' || params?.sort === 'price-desc') {
      return this.findAllSortedByPrice(params, page, limit, params.sort === 'price-desc' ? 'desc' : 'asc');
    }

    const orderBy: Prisma.ServiceOrderByWithRelationInput =
      params?.sort === 'name-desc' ? { name: 'desc' } :
      params?.sort === 'avgRating' ? { avgRating: 'desc' } :
      params?.sort === 'avgRating-asc' ? { avgRating: 'asc' } :
      { name: 'asc' };

    const ownerInclude = {
      category: true,
      variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' as const } },
      _count: { select: { staffs: true, bookingItems: true } },
    };

    const [items, total] = await Promise.all([
      this.prisma.service.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: ownerInclude }),
      this.prisma.service.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private async findAllSortedByPrice(params: ServiceParams, page: number, limit: number, direction: 'asc' | 'desc') {
    const offset = (page - 1) * limit;
    const dir = direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const conds: Prisma.Sql[] = [Prisma.sql`sv.status = 'ACTIVE'`];
    if (params.storeId) conds.push(Prisma.sql`s.store_id = ${params.storeId}`);
    if (params.status) conds.push(Prisma.sql`s.status = ${params.status}`);
    if (params.categoryId) conds.push(Prisma.sql`s.category_id = ${params.categoryId}`);

    const whereClause = Prisma.join(conds, ' AND ');

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT s.id
        FROM services s
        INNER JOIN service_variants sv ON sv.service_id = s.id
        WHERE ${whereClause}
        GROUP BY s.id
        ORDER BY MIN(sv.price) ${dir}, s.id ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT s.id) AS total
        FROM services s
        INNER JOIN service_variants sv ON sv.service_id = s.id
        WHERE ${whereClause}
      `),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const ids = rows.map((r) => r.id);
    if (!ids.length) return { items: [], total, page, limit };

    const ownerInclude = {
      category: true,
      variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' as const } },
      _count: { select: { staffs: true, bookingItems: true } },
    };

    const items = await this.prisma.service.findMany({ where: { id: { in: ids } }, include: ownerInclude });
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return { items, total, page, limit };
  }

  async findPublic(params: PublicServiceParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where: Prisma.ServiceWhereInput = {
      status: ServiceStatus.ACTIVE,
      store: { status: StoreStatus.ACTIVE },
      ...(params.storeId && { storeId: params.storeId }),
      ...(params.categoryId && {
        OR: [
          { category: { parentId: params.categoryId } },
          { categoryId: params.categoryId },
        ],
      }),
      ...(params.q && {
        OR: [
          { name: { contains: params.q } },
          { description: { contains: params.q } },
        ],
      }),
      ...((params.minPrice !== undefined || params.maxPrice !== undefined) && {
        variants: {
          some: {
            status: ServiceStatus.ACTIVE,
            price: {
              ...(params.minPrice !== undefined && { gte: params.minPrice }),
              ...(params.maxPrice !== undefined && { lte: params.maxPrice }),
            },
          },
        },
      }),
      ...((params.minRating !== undefined || params.maxRating !== undefined) && {
        avgRating: {
          ...(params.minRating !== undefined && { gte: params.minRating }),
          ...(params.maxRating !== undefined && { lte: params.maxRating }),
        },
      }),
    };

    const publicInclude = {
      category: true,
      store: { select: { id: true, name: true, slug: true, logoUrl: true, provinceId: true, avgRating: true } },
      variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' as const } },
    };

    if (params.sort === 'price' || params.sort === 'price-desc') {
      return this.findPublicSortedByPrice(params, publicInclude, page, limit, params.sort === 'price-desc' ? 'desc' : 'asc');
    }

    if (params.sort === 'popular') {
      return this.findPublicSortedByPopular(params, publicInclude, page, limit);
    }

    const orderBy: Prisma.ServiceOrderByWithRelationInput =
      params.sort === 'newest' ? { createdAt: 'desc' } :
      params.sort === 'avgRating' ? { avgRating: 'desc' } :
      { avgRating: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.service.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: publicInclude }),
      this.prisma.service.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private async findPublicSortedByPrice(
    params: PublicServiceParams,
    include: object,
    page: number,
    limit: number,
    direction: 'asc' | 'desc' = 'asc',
  ) {
    const offset = (page - 1) * limit;
    const dir = direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const conds: Prisma.Sql[] = [
      Prisma.sql`s.status = 'ACTIVE'`,
      Prisma.sql`st.status = 'ACTIVE'`,
    ];

    if (params.storeId) conds.push(Prisma.sql`s.store_id = ${params.storeId}`);

    if (params.categoryId) {
      conds.push(Prisma.sql`(
        s.category_id = ${params.categoryId}
        OR EXISTS (
          SELECT 1 FROM service_categories sc
          WHERE sc.id = s.category_id AND sc.parent_id = ${params.categoryId}
        )
      )`);
    }

    if (params.q) {
      const like = `%${params.q}%`;
      conds.push(Prisma.sql`(s.name LIKE ${like} OR s.description LIKE ${like})`);
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      const priceConds: Prisma.Sql[] = [
        Prisma.sql`pv.service_id = s.id`,
        Prisma.sql`pv.status = 'ACTIVE'`,
      ];
      if (params.minPrice !== undefined) priceConds.push(Prisma.sql`pv.price >= ${params.minPrice}`);
      if (params.maxPrice !== undefined) priceConds.push(Prisma.sql`pv.price <= ${params.maxPrice}`);
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM service_variants pv WHERE ${Prisma.join(priceConds, ' AND ')})`);
    }

    if (params.minRating !== undefined) conds.push(Prisma.sql`s.avg_rating >= ${params.minRating}`);
    if (params.maxRating !== undefined) conds.push(Prisma.sql`s.avg_rating <= ${params.maxRating}`);

    const where = Prisma.join(conds, ' AND ');

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT s.id
        FROM services s
        INNER JOIN stores st ON st.id = s.store_id
        INNER JOIN service_variants sv ON sv.service_id = s.id AND sv.status = 'ACTIVE'
        WHERE ${where}
        GROUP BY s.id
        ORDER BY MIN(sv.price) ${dir}, s.id ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT s.id) AS total
        FROM services s
        INNER JOIN stores st ON st.id = s.store_id
        INNER JOIN service_variants sv ON sv.service_id = s.id AND sv.status = 'ACTIVE'
        WHERE ${where}
      `),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const paginatedIds = rows.map((r) => r.id);
    if (!paginatedIds.length) return { items: [], total, page, limit };

    const items = await this.prisma.service.findMany({
      where: { id: { in: paginatedIds } },
      include: include as any,
    });

    const order = new Map(paginatedIds.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return { items, total, page, limit };
  }

  private async findPublicSortedByPopular(params: PublicServiceParams, include: object, page: number, limit: number) {
    const offset = (page - 1) * limit;

    const conds: Prisma.Sql[] = [
      Prisma.sql`s.status = 'ACTIVE'`,
      Prisma.sql`st.status = 'ACTIVE'`,
    ];

    if (params.storeId) conds.push(Prisma.sql`s.store_id = ${params.storeId}`);

    if (params.categoryId) {
      conds.push(Prisma.sql`(
        s.category_id = ${params.categoryId}
        OR EXISTS (
          SELECT 1 FROM service_categories sc
          WHERE sc.id = s.category_id AND sc.parent_id = ${params.categoryId}
        )
      )`);
    }

    if (params.q) {
      const like = `%${params.q}%`;
      conds.push(Prisma.sql`(s.name LIKE ${like} OR s.description LIKE ${like})`);
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      const priceConds: Prisma.Sql[] = [
        Prisma.sql`pv.service_id = s.id`,
        Prisma.sql`pv.status = 'ACTIVE'`,
      ];
      if (params.minPrice !== undefined) priceConds.push(Prisma.sql`pv.price >= ${params.minPrice}`);
      if (params.maxPrice !== undefined) priceConds.push(Prisma.sql`pv.price <= ${params.maxPrice}`);
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM service_variants pv WHERE ${Prisma.join(priceConds, ' AND ')})`);
    }

    if (params.minRating !== undefined) conds.push(Prisma.sql`s.avg_rating >= ${params.minRating}`);
    if (params.maxRating !== undefined) conds.push(Prisma.sql`s.avg_rating <= ${params.maxRating}`);

    const where = Prisma.join(conds, ' AND ');

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT s.id
        FROM services s
        INNER JOIN stores st ON st.id = s.store_id
        LEFT JOIN booking_items bi ON bi.service_id = s.id
        LEFT JOIN bookings b ON b.id = bi.booking_id AND b.status = 'COMPLETED'
        WHERE ${where}
        GROUP BY s.id
        ORDER BY COUNT(bi.id) DESC, s.avg_rating DESC, s.id ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT s.id) AS total
        FROM services s
        INNER JOIN stores st ON st.id = s.store_id
        WHERE ${where}
      `),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const paginatedIds = rows.map((r) => r.id);
    if (!paginatedIds.length) return { items: [], total, page, limit };

    const items = await this.prisma.service.findMany({
      where: { id: { in: paginatedIds } },
      include: include as any,
    });

    const order = new Map(paginatedIds.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return { items, total, page, limit };
  }

  async findOne(idOrSlug: string, storeId?: string, userLat?: number, userLng?: number) {
    const service = await this.prisma.service.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        ...(storeId && { storeId }),
      },
      include: serviceInclude,
    });
    if (!service) throw new NotFoundException('Service not found');

    const { latitude, longitude, ...storeWithoutCoords } = service.store as typeof service.store & { latitude: number | null; longitude: number | null };
    const distance =
      userLat != null && userLng != null && latitude != null && longitude != null
        ? calcDistance(userLat, userLng, latitude, longitude)
        : undefined;

    return { ...service, store: { ...storeWithoutCoords, ...(distance !== undefined && { distance }) } };
  }

  async update(id: string, storeId: string, dto: UpdateServiceDto, actorId: string) {
    const service = await this.findOne(id, storeId);
    if (dto.name) await this.checkDuplicateName(dto.name, storeId, id);
    const slug = dto.name ? await this.generateUniqueSlug(dto.name, storeId, id) : undefined;

    if (dto.imageUrls !== undefined) {
      const current = Array.isArray(service.imageUrls) ? (service.imageUrls as string[]) : [];
      const removed = current.filter((url) => !dto.imageUrls!.includes(url));
      await Promise.allSettled(
        removed.map((url) => this.cloudinary.deleteImage(this.cloudinary.extractPublicId(url))),
      );
    }

    await this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        status: dto.status,
        categoryId: dto.categoryId,
        ...(dto.imageUrls !== undefined && { imageUrls: dto.imageUrls }),
      },
    });

    this.systemLog.log({
      type: LogType.SERVICE_UPDATED,
      actorId,
      storeId,
      targetId: id,
      targetType: 'Service',
      metadata: { name: service.name },
    });

    return this.findOne(id, storeId);
  }

  async addVariant(serviceId: string, storeId: string, dto: CreateServiceVariantDto) {
    await this.findOne(serviceId, storeId);
    return this.prisma.serviceVariant.create({
      data: {
        serviceId,
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        price: dto.price,
        costPrice: dto.costPrice,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? ServiceStatus.ACTIVE,
      },
    });
  }

  async updateVariant(serviceId: string, variantId: string, storeId: string, dto: UpdateServiceVariantDto) {
    await this.findVariantOrThrow(serviceId, variantId, storeId);
    return this.prisma.serviceVariant.update({
      where: { id: variantId },
      data: {
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        price: dto.price,
        costPrice: dto.costPrice,
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
    });
  }

  async removeVariant(serviceId: string, variantId: string, storeId: string) {
    await this.findVariantOrThrow(serviceId, variantId, storeId);

    const activeCount = await this.prisma.serviceVariant.count({
      where: { serviceId, status: ServiceStatus.ACTIVE },
    });
    if (activeCount <= 1) {
      throw new BadRequestException('Dịch vụ phải có ít nhất 1 gói đang hoạt động');
    }

    await this.prisma.serviceVariant.update({
      where: { id: variantId },
      data: { status: ServiceStatus.INACTIVE },
    });
    return { deleted: true };
  }

  async assignStaff(id: string, storeId: string, staffIds: string[]) {
    const service = await this.findOne(id, storeId);
    const uniqueStaffIds = [...new Set(staffIds)];
    if (uniqueStaffIds.length) {
      const validCount = await this.prisma.staff.count({
        where: {
          id: { in: uniqueStaffIds },
          storeId,
          status: StaffStatus.ACTIVE,
        },
      });
      if (validCount !== uniqueStaffIds.length) {
        throw new BadRequestException('All staff must belong to this store and be active');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.staffService.deleteMany({ where: { serviceId: id } });
      if (uniqueStaffIds.length) {
        await tx.staffService.createMany({
          data: uniqueStaffIds.map((staffId) => ({ serviceId: id, staffId })),
          skipDuplicates: true,
        });
      }
    });
    return this.prisma.service.findUnique({
      where: { id: service.id },
      include: serviceInclude,
    });
  }

  async uploadImages(id: string, storeId: string, files: Express.Multer.File[]) {
    const service = await this.findOne(id, storeId);
    const current = Array.isArray(service.imageUrls) ? (service.imageUrls as string[]) : [];

    if (current.length + files.length > MAX_IMAGES) {
      throw new BadRequestException(
        `Dịch vụ không được có quá ${MAX_IMAGES} hình ảnh (hiện có ${current.length})`,
      );
    }

    const uploaded = await Promise.all(
      files.map((f) => this.cloudinary.uploadImage(f, `glowora/services/${storeId}`)),
    );

    return this.prisma.service.update({
      where: { id },
      data: { imageUrls: [...current, ...uploaded] },
      include: serviceInclude,
    });
  }

  async removeImage(id: string, storeId: string, url: string) {
    const service = await this.findOne(id, storeId);
    const current = Array.isArray(service.imageUrls) ? (service.imageUrls as string[]) : [];

    if (!current.includes(url)) {
      throw new BadRequestException('Ảnh không tồn tại trong dịch vụ');
    }

    await this.cloudinary.deleteImage(this.cloudinary.extractPublicId(url));

    return this.prisma.service.update({
      where: { id },
      data: { imageUrls: current.filter((u) => u !== url) },
      include: serviceInclude,
    });
  }

  async remove(id: string, storeId: string, actorId: string) {
    const service = await this.findOne(id, storeId);
    await this.prisma.service.update({
      where: { id },
      data: { status: ServiceStatus.INACTIVE },
    });

    this.systemLog.log({
      type: LogType.SERVICE_DELETED,
      actorId,
      storeId,
      targetId: id,
      targetType: 'Service',
      metadata: { name: service.name },
    });

    return { deleted: true };
  }

  private async findVariantOrThrow(serviceId: string, variantId: string, storeId: string) {
    const variant = await this.prisma.serviceVariant.findFirst({
      where: { id: variantId, serviceId, service: { storeId } },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  private async generateUniqueSlug(name: string, storeId: string, excludeId?: string) {
    const base = slugify(name) || 'service';
    let slug = base;
    let suffix = 2;
    while (true) {
      const existing = await this.prisma.service.findFirst({
        where: { storeId, slug, ...(excludeId && { id: { not: excludeId } }) },
      });
      if (!existing) return slug;
      slug = `${base}-${suffix++}`;
    }
  }
}
