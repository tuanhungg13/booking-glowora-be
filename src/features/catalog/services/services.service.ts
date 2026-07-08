import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, LogType, Prisma, ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CloudinaryService } from '../../../cloudinary/cloudinary.service';
import { SystemLogService } from '../../../system-log/system-log.service';
import { PromotionsService } from '../../booking/promotions/promotions.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

type ServiceParams = { storeId?: string; q?: string; status?: ServiceStatus; categoryId?: string; sort?: 'newest' | 'name' | 'name-desc' | 'price' | 'price-desc' | 'avgRating' | 'avgRating-asc' | 'popular'; page?: number; limit?: number };
type PublicServiceParams = { storeId?: string; categoryId?: string; q?: string; minPrice?: number; maxPrice?: number; minRating?: number; maxRating?: number; minDuration?: number; maxDuration?: number; sort?: 'avgRating' | 'price' | 'price-desc' | 'newest' | 'popular'; page?: number; limit?: number };

const serviceInclude = {
  category: true,
  variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' as const } },
  store: {
    select: {
      id: true, name: true, slug: true, address: true, logoUrl: true, latitude: true, longitude: true,
      province: { select: { id: true, name: true, type: true } },
      ward: { select: { id: true, name: true, type: true } },
    },
  },
  _count: { select: { reviews: { where: { isVisible: true } } } },
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

type ActivePromotion = Awaited<ReturnType<PromotionsService['findActiveForStore']>>;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly systemLog: SystemLogService,
    private readonly promotions: PromotionsService,
  ) {}

  private applyPromoToVariants<T extends { id: string; price: Prisma.Decimal }[]>(
    variants: T,
    serviceId: string,
    categoryId: string | null,
    promotion: NonNullable<ActivePromotion>,
  ) {
    return variants.map((v) => {
      if (!this.promotions.isServiceInScope(promotion, serviceId, categoryId)) return v;
      const saving = this.promotions.calcDiscount(promotion, Number(v.price));
      return {
        ...v,
        promotionalPrice: Number(v.price) - saving,
        promotionSaving: saving,
        promotionId: promotion.id,
      };
    });
  }

  private async enrichServicesWithPromotion<
    T extends { id: string; categoryId: string | null; storeId: string; variants: { id: string; price: Prisma.Decimal }[] },
  >(services: T[], storeId?: string): Promise<{ items: T[]; activePromotion: ActivePromotion }> {
    if (!services.length) return { items: services, activePromotion: null };

    // Fetch promotion per unique store so multi-store listings each get their own promotion
    const storeIds = storeId ? [storeId] : [...new Set(services.map((s) => s.storeId))];
    const promoEntries = await Promise.all(
      storeIds.map(async (sid) => [sid, await this.promotions.findActiveForStore(sid)] as const),
    );
    const promoMap = new Map(
      promoEntries.filter((e): e is [string, NonNullable<ActivePromotion>] => e[1] !== null),
    );
    if (!promoMap.size) return { items: services, activePromotion: null };

    const enriched = services.map((svc) => {
      const promotion = promoMap.get(svc.storeId);
      if (!promotion) return svc;
      return { ...svc, variants: this.applyPromoToVariants(svc.variants, svc.id, svc.categoryId, promotion) };
    }) as T[];

    return { items: enriched, activePromotion: [...promoMap.values()][0] ?? null };
  }

  private async checkDuplicateName(name: string, storeId: string, excludeId?: string) {
    const existing = await this.prisma.service.findFirst({
      where: {
        storeId,
        name: { equals: name },
        status: { not: ServiceStatus.DELETED },
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
        imageUrls: dto.imageUrls ?? [],
        variants: {
          create: dto.variants.map((v, i) => ({
            name: v.name,
            description: v.description,
            duration: v.duration,
            price: v.price,
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
      status: params?.status ?? { not: ServiceStatus.DELETED },
      ...(params?.categoryId && { categoryId: params.categoryId }),
      ...(params?.q && { name: { contains: params.q } }),
    };

    if (params?.sort === 'price' || params?.sort === 'price-desc') {
      return this.findAllSortedByPrice(params, page, limit, params.sort === 'price-desc' ? 'desc' : 'asc');
    }

    if (params?.sort === 'popular') {
      return this.findAllSortedByPopular(params, page, limit);
    }

    const orderBy: Prisma.ServiceOrderByWithRelationInput =
      params?.sort === 'name' ? { name: 'asc' } :
      params?.sort === 'name-desc' ? { name: 'desc' } :
      params?.sort === 'avgRating' ? { avgRating: 'desc' } :
      params?.sort === 'avgRating-asc' ? { avgRating: 'asc' } :
      { createdAt: 'desc' };

    const ownerInclude = {
      category: true,
      variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' as const } },
      _count: { select: { bookingItems: true } },
    };

    const [rawItems, total] = await Promise.all([
      this.prisma.service.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: ownerInclude }),
      this.prisma.service.count({ where }),
    ]);

    const { items, activePromotion } = await this.enrichServicesWithPromotion(rawItems, params?.storeId);
    return { items, total, page, limit, activePromotion };
  }

  private async findAllSortedByPrice(params: ServiceParams, page: number, limit: number, direction: 'asc' | 'desc') {
    const offset = (page - 1) * limit;
    const dir = direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const conds: Prisma.Sql[] = [Prisma.sql`sv.status = 'ACTIVE'`];
    if (params.storeId) conds.push(Prisma.sql`s.store_id = ${params.storeId}`);
    conds.push(params.status ? Prisma.sql`s.status = ${params.status}` : Prisma.sql`s.status != 'DELETED'`);
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
      _count: { select: { bookingItems: true } },
    };

    const items = await this.prisma.service.findMany({ where: { id: { in: ids } }, include: ownerInclude });
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return { items, total, page, limit };
  }

  private async findAllSortedByPopular(params: ServiceParams, page: number, limit: number) {
    const offset = (page - 1) * limit;

    const conds: Prisma.Sql[] = [
      params?.status ? Prisma.sql`s.status = ${params.status}` : Prisma.sql`s.status != 'DELETED'`,
    ];
    if (params?.storeId) conds.push(Prisma.sql`s.store_id = ${params.storeId}`);
    if (params?.categoryId) conds.push(Prisma.sql`s.category_id = ${params.categoryId}`);
    if (params?.q) {
      const like = `%${params.q}%`;
      conds.push(Prisma.sql`s.name LIKE ${like}`);
    }

    const where = Prisma.join(conds, ' AND ');

    const ownerInclude = {
      category: true,
      variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' as const } },
      _count: { select: { bookingItems: true } },
    };

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT s.id
        FROM services s
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
        WHERE ${where}
      `),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const ids = rows.map((r) => r.id);
    if (!ids.length) return { items: [], total, page, limit, activePromotion: null };

    const items = await this.prisma.service.findMany({ where: { id: { in: ids } }, include: ownerInclude });
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const { items: enriched, activePromotion } = await this.enrichServicesWithPromotion(items, params?.storeId);
    return { items: enriched, total, page, limit, activePromotion };
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
      ...((params.minPrice !== undefined || params.maxPrice !== undefined || params.minDuration !== undefined || params.maxDuration !== undefined) && {
        variants: {
          some: {
            status: ServiceStatus.ACTIVE,
            ...(( params.minPrice !== undefined || params.maxPrice !== undefined) && {
              price: {
                ...(params.minPrice !== undefined && { gte: params.minPrice }),
                ...(params.maxPrice !== undefined && { lte: params.maxPrice }),
              },
            }),
            ...(( params.minDuration !== undefined || params.maxDuration !== undefined) && {
              duration: {
                ...(params.minDuration !== undefined && { gte: params.minDuration }),
                ...(params.maxDuration !== undefined && { lte: params.maxDuration }),
              },
            }),
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

    const [rawItems, total] = await Promise.all([
      this.prisma.service.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: publicInclude }),
      this.prisma.service.count({ where }),
    ]);

    const { items, activePromotion } = await this.enrichServicesWithPromotion(rawItems, params.storeId);
    return { items, total, page, limit, activePromotion };
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

    const hasVariantFilter = params.minPrice !== undefined || params.maxPrice !== undefined || params.minDuration !== undefined || params.maxDuration !== undefined;
    if (hasVariantFilter) {
      const variantConds: Prisma.Sql[] = [
        Prisma.sql`pv.service_id = s.id`,
        Prisma.sql`pv.status = 'ACTIVE'`,
      ];
      if (params.minPrice !== undefined) variantConds.push(Prisma.sql`pv.price >= ${params.minPrice}`);
      if (params.maxPrice !== undefined) variantConds.push(Prisma.sql`pv.price <= ${params.maxPrice}`);
      if (params.minDuration !== undefined) variantConds.push(Prisma.sql`pv.duration >= ${params.minDuration}`);
      if (params.maxDuration !== undefined) variantConds.push(Prisma.sql`pv.duration <= ${params.maxDuration}`);
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM service_variants pv WHERE ${Prisma.join(variantConds, ' AND ')})`);
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
    if (!paginatedIds.length) return { items: [], total, page, limit, activePromotion: null };

    const rawItems = await this.prisma.service.findMany({
      where: { id: { in: paginatedIds } },
      include: include as any,
    });

    const order = new Map(paginatedIds.map((id, i) => [id, i]));
    rawItems.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const { items, activePromotion } = await this.enrichServicesWithPromotion(rawItems as any, params.storeId);
    return { items, total, page, limit, activePromotion };
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

    const hasVariantFilterPopular = params.minPrice !== undefined || params.maxPrice !== undefined || params.minDuration !== undefined || params.maxDuration !== undefined;
    if (hasVariantFilterPopular) {
      const variantConds: Prisma.Sql[] = [
        Prisma.sql`pv.service_id = s.id`,
        Prisma.sql`pv.status = 'ACTIVE'`,
      ];
      if (params.minPrice !== undefined) variantConds.push(Prisma.sql`pv.price >= ${params.minPrice}`);
      if (params.maxPrice !== undefined) variantConds.push(Prisma.sql`pv.price <= ${params.maxPrice}`);
      if (params.minDuration !== undefined) variantConds.push(Prisma.sql`pv.duration >= ${params.minDuration}`);
      if (params.maxDuration !== undefined) variantConds.push(Prisma.sql`pv.duration <= ${params.maxDuration}`);
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM service_variants pv WHERE ${Prisma.join(variantConds, ' AND ')})`);
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
    if (!paginatedIds.length) return { items: [], total, page, limit, activePromotion: null };

    const rawItems = await this.prisma.service.findMany({
      where: { id: { in: paginatedIds } },
      include: include as any,
    });

    const order = new Map(paginatedIds.map((id, i) => [id, i]));
    rawItems.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const { items, activePromotion } = await this.enrichServicesWithPromotion(rawItems as any, params.storeId);
    return { items, total, page, limit, activePromotion };
  }

  async findOne(idOrSlug: string, storeId?: string, userLat?: number, userLng?: number) {
    const service = await this.prisma.service.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        status: { not: ServiceStatus.DELETED },
        ...(storeId && { storeId }),
      },
      include: serviceInclude,
    });
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');

    const { latitude, longitude, ...storeWithoutCoords } = service.store as typeof service.store & { latitude: number | null; longitude: number | null };
    const distance =
      userLat != null && userLng != null && latitude != null && longitude != null
        ? calcDistance(userLat, userLng, latitude, longitude)
        : undefined;

    const promotion = await this.promotions.findActiveForStore(service.storeId);
    const enrichedVariants = promotion
      ? this.applyPromoToVariants(service.variants, service.id, service.categoryId, promotion)
      : service.variants;

    return {
      ...service,
      variants: enrichedVariants,
      activePromotion: promotion ?? null,
      store: { ...storeWithoutCoords, ...(distance !== undefined && { distance }) },
    };
  }

  async update(id: string, storeId: string, dto: UpdateServiceDto, actorId: string) {
    const service = await this.findOne(id, storeId);
    if (dto.status === ServiceStatus.INACTIVE) await this.checkNoUpcomingBookings(id);
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

    if (dto.variants !== undefined) {
      const activeCount = dto.variants.filter((v) => (v.status ?? ServiceStatus.ACTIVE) === ServiceStatus.ACTIVE).length;
      if (activeCount === 0) {
        throw new BadRequestException('Dịch vụ phải có ít nhất 1 gói đang hoạt động');
      }

      const existing = await this.prisma.serviceVariant.findMany({
        where: { serviceId: id },
        select: { id: true },
      });
      const existingIds = existing.map((v) => v.id);
      const incomingIds = dto.variants.filter((v) => v.id).map((v) => v.id!);
      const toDeactivate = existingIds.filter((vId) => !incomingIds.includes(vId));

      await this.prisma.$transaction(async (tx) => {
        if (toDeactivate.length > 0) {
          await tx.serviceVariant.updateMany({
            where: { id: { in: toDeactivate } },
            data: { status: ServiceStatus.INACTIVE },
          });
        }
        for (const v of dto.variants!.filter((v) => v.id)) {
          await tx.serviceVariant.update({
            where: { id: v.id },
            data: { name: v.name, description: v.description, duration: v.duration, price: v.price, sortOrder: v.sortOrder, status: v.status },
          });
        }
        for (const [i, v] of dto.variants!.filter((v) => !v.id).entries()) {
          await tx.serviceVariant.create({
            data: { serviceId: id, name: v.name, description: v.description, duration: v.duration, price: v.price, sortOrder: v.sortOrder ?? i, status: v.status ?? ServiceStatus.ACTIVE },
          });
        }
      });
    }

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

  private async checkNoUpcomingBookings(serviceId: string) {
    const count = await this.prisma.booking.count({
      where: {
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.DEPOSIT_PENDING, BookingStatus.DEPOSIT_PAID, BookingStatus.PAID] },
        scheduledAt: { gt: new Date() },
        items: { some: { serviceId } },
      },
    });
    if (count > 0) {
      throw new BadRequestException(
        `Dịch vụ đang có ${count} lịch hẹn sắp tới. Vui lòng hủy hoặc hoàn thành các lịch hẹn trước khi thực hiện thao tác này.`,
      );
    }
  }

  async remove(id: string, storeId: string, actorId: string) {
    const service = await this.findOne(id, storeId);
    await this.checkNoUpcomingBookings(id);

    const urls = Array.isArray(service.imageUrls) ? (service.imageUrls as string[]) : [];
    await Promise.allSettled(
      urls.map((url) => this.cloudinary.deleteImage(this.cloudinary.extractPublicId(url))),
    );

    await this.prisma.service.delete({ where: { id } });

    this.systemLog.log({
      type: LogType.SERVICE_DELETED,
      actorId,
      storeId,
      targetId: id,
      targetType: 'Service',
      metadata: { name: service.name, permanent: true },
    });

    return { deleted: true };
  }

  async bulkHardDelete(storeId: string, ids: string[], actorId: string) {
    const services = await this.prisma.service.findMany({
      where: { id: { in: ids }, storeId },
      select: { id: true, name: true, imageUrls: true },
    });

    let deletedCount = 0;
    const failedIds: string[] = [];

    await Promise.allSettled(
      services.map(async (service) => {
        try {
          await this.checkNoUpcomingBookings(service.id);

          const urls = Array.isArray(service.imageUrls) ? (service.imageUrls as string[]) : [];
          await Promise.allSettled(
            urls.map((url) => this.cloudinary.deleteImage(this.cloudinary.extractPublicId(url))),
          );

          await this.prisma.service.delete({ where: { id: service.id } });

          this.systemLog.log({
            type: LogType.SERVICE_DELETED,
            actorId,
            storeId,
            targetId: service.id,
            targetType: 'Service',
            metadata: { name: service.name, permanent: true },
          });

          deletedCount++;
        } catch {
          failedIds.push(service.id);
        }
      }),
    );

    return { deletedCount, failedCount: failedIds.length, failedIds };
  }

  private async generateUniqueSlug(name: string, storeId: string, excludeId?: string) {
    const base = slugify(name) || 'service';
    let slug = base;
    let suffix = 2;
    while (true) {
      const existing = await this.prisma.service.findFirst({
        where: { storeId, slug, status: { not: ServiceStatus.DELETED }, ...(excludeId && { id: { not: excludeId } }) },
      });
      if (!existing) return slug;
      slug = `${base}-${suffix++}`;
    }
  }
}
