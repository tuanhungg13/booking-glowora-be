import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateServiceVariantDto, UpdateServiceVariantDto } from './dto/service-variant.dto';

type ServiceParams = { storeId?: string; status?: ServiceStatus; categoryId?: string; page?: number; limit?: number };
type PublicServiceParams = { storeId?: string; categoryId?: string; q?: string; minPrice?: number; maxPrice?: number; minRating?: number; maxRating?: number; sort?: 'avgRating' | 'price' | 'price-desc' | 'newest'; page?: number; limit?: number };

const serviceInclude = {
  category: true,
  variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' as const } },
  staffs: { include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } } } },
  store: { select: { id: true, name: true, slug: true, address: true, district: true, logoUrl: true } },
} as const;

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

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, dto: CreateServiceDto) {
    const slug = await this.generateUniqueSlug(dto.name, storeId);
    return this.prisma.service.create({
      data: {
        shopId: storeId,
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
  }

  async findAll(params?: ServiceParams) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const where = {
      ...(params?.storeId && { shopId: params.storeId }),
      ...(params?.status && { status: params.status }),
      ...(params?.categoryId && { categoryId: params.categoryId }),
    };

    const [items, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: true,
          variants: { where: { status: ServiceStatus.ACTIVE }, orderBy: { sortOrder: 'asc' } },
          _count: { select: { staffs: true, bookingItems: true } },
        },
      }),
      this.prisma.service.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findPublic(params: PublicServiceParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where: Prisma.ServiceWhereInput = {
      status: ServiceStatus.ACTIVE,
      store: { status: StoreStatus.ACTIVE },
      ...(params.storeId && { shopId: params.storeId }),
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
      return this.findPublicSortedByPrice(where, publicInclude, page, limit, params.sort === 'price-desc' ? 'desc' : 'asc');
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
    where: Prisma.ServiceWhereInput,
    include: object,
    page: number,
    limit: number,
    direction: 'asc' | 'desc' = 'asc',
  ) {
    const allIds = await this.prisma.service.findMany({ where, select: { id: true } });
    const ids = allIds.map((s) => s.id);

    const grouped = await this.prisma.serviceVariant.groupBy({
      by: ['serviceId'],
      where: { serviceId: { in: ids }, status: ServiceStatus.ACTIVE },
      _min: { price: true },
      orderBy: { _min: { price: direction } },
    });

    const paginatedIds = grouped.slice((page - 1) * limit, page * limit).map((g) => g.serviceId);

    const items = await this.prisma.service.findMany({
      where: { id: { in: paginatedIds } },
      include: include as any,
    });

    const order = new Map(paginatedIds.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return { items, total: ids.length, page, limit };
  }

  async findOne(idOrSlug: string, storeId?: string) {
    const service = await this.prisma.service.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        ...(storeId && { shopId: storeId }),
      },
      include: serviceInclude,
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async update(id: string, storeId: string, dto: UpdateServiceDto) {
    await this.findOne(id, storeId);
    const slug = dto.name ? await this.generateUniqueSlug(dto.name, storeId, id) : undefined;

    await this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        status: dto.status,
        categoryId: dto.categoryId,
      },
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
    await this.prisma.$transaction(async (tx) => {
      await tx.staffService.deleteMany({ where: { serviceId: id } });
      if (staffIds.length) {
        await tx.staffService.createMany({
          data: staffIds.map((staffId) => ({ serviceId: id, staffId })),
          skipDuplicates: true,
        });
      }
    });
    return this.prisma.service.findUnique({
      where: { id: service.id },
      include: serviceInclude,
    });
  }

  async remove(id: string, storeId: string) {
    await this.findOne(id, storeId);
    await this.prisma.service.update({
      where: { id },
      data: { status: ServiceStatus.INACTIVE },
    });
    return { deleted: true };
  }

  private async findVariantOrThrow(serviceId: string, variantId: string, storeId: string) {
    const variant = await this.prisma.serviceVariant.findFirst({
      where: { id: variantId, serviceId, service: { shopId: storeId } },
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
        where: { shopId: storeId, slug, ...(excludeId && { id: { not: excludeId } }) },
      });
      if (!existing) return slug;
      slug = `${base}-${suffix++}`;
    }
  }
}
