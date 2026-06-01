import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DayOfWeek, Prisma, StaffStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionCacheService } from '../../redis/permission-cache.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { StoreFilterDto } from './dto/store-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';

const SHOP_OWNER_ROLE_CODE = 'SHOP_OWNER';
const MAX_SHOP_ROLES_PER_USER = 3;

const storeListInclude = {
  workingHours: { orderBy: { dayOfWeek: 'asc' as const } },
  owner: { select: { id: true, fullName: true, email: true, phone: true } },
  province: { select: { id: true, name: true, type: true } },
  ward: { select: { id: true, name: true, type: true } },
  _count: { select: { services: true, reviews: true, staff: true } },
} as const;

const storeDetailInclude = {
  ...storeListInclude,
  services: {
    where: { status: 'ACTIVE' as const },
    include: {
      category: true,
      variants: { where: { status: 'ACTIVE' as const }, orderBy: { sortOrder: 'asc' as const } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  reviews: {
    where: { isVisible: true },
    take: 5,
    orderBy: { createdAt: 'desc' as const },
    include: {
      customer: { select: { id: true, fullName: true, avatarUrl: true } },
      service: { select: { id: true, name: true } },
    },
  },
} as const;

const defaultWorkingHours = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
].map((dayOfWeek) => ({
  dayOfWeek,
  openTime: '08:00',
  closeTime: '20:00',
  isClosed: dayOfWeek === DayOfWeek.SUNDAY,
}));

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async create(dto: CreateStoreDto, ownerId: string) {
    if (dto.provinceId) {
      const province = await this.prisma.province.findUnique({ where: { id: dto.provinceId } });
      if (!province) throw new BadRequestException(`Province ${dto.provinceId} not found`);
    }
    if (dto.wardId) {
      const ward = await this.prisma.ward.findUnique({ where: { id: dto.wardId } });
      if (!ward) throw new BadRequestException(`Ward ${dto.wardId} not found`);
      if (dto.provinceId && ward.provinceId !== dto.provinceId) {
        throw new BadRequestException('Ward does not belong to the specified province');
      }
    }

    const existingStore = await this.prisma.store.findFirst({
      where: { ownerId, name: dto.name, address: dto.address },
    });
    if (existingStore) {
      throw new ConflictException('Store already exists for this owner and address');
    }

    const shopRoleCount = await this.prisma.userRole.count({
      where: { userId: ownerId, shopId: { not: null } },
    });
    if (shopRoleCount >= MAX_SHOP_ROLES_PER_USER) {
      throw new BadRequestException('User has reached the maximum of 3 shop roles');
    }

    const templateRole = await this.prisma.role.findFirst({
      where: { code: SHOP_OWNER_ROLE_CODE, shopId: null },
      include: { permissions: true },
    });
    if (!templateRole) {
      throw new BadRequestException('SHOP_OWNER template role is missing. Run database seed first.');
    }

    const slug = await this.generateUniqueSlug(dto.name, dto.provinceId);

    const store = await this.prisma.$transaction(async (tx) => {
      const createdStore = await tx.store.create({
        data: {
          ownerId,
          name: dto.name,
          slug,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          description: dto.description,
          address: dto.address,
          district: dto.district,
          wardId: dto.wardId,
          provinceId: dto.provinceId,
          status: StoreStatus.PENDING,
          slotIntervalMins: dto.slotIntervalMins,
          cancelBeforeHours: dto.cancelBeforeHours,
          maxAdvanceDays: dto.maxAdvanceDays,
          bookingBufferMins: dto.bookingBufferMins,
          autoConfirm: dto.autoConfirm,
        },
      });

      await tx.workingHour.createMany({
        data: defaultWorkingHours.map((hour) => ({
          storeId: createdStore.id,
          ...hour,
        })),
      });

      const ownerRole = await tx.role.create({
        data: {
          name: templateRole.name,
          code: templateRole.code,
          description: templateRole.description,
          isSystem: false,
          shopId: createdStore.id,
        },
      });

      if (templateRole.permissions.length) {
        await tx.rolePermission.createMany({
          data: templateRole.permissions.map((permission) => ({
            roleId: ownerRole.id,
            permissionId: permission.permissionId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.userRole.create({
        data: {
          userId: ownerId,
          roleId: ownerRole.id,
          shopId: createdStore.id,
        },
      });

      await tx.staff.create({
        data: {
          userId: ownerId,
          storeId: createdStore.id,
          status: StaffStatus.ACTIVE,
        },
      });

      return tx.store.findUniqueOrThrow({
        where: { id: createdStore.id },
        include: storeListInclude,
      });
    });

    await this.permissionCache.invalidateUser(ownerId);
    return store;
  }

  async findAll(filter: StoreFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 12;
    const hasLocation = filter.userLat != null && filter.userLng != null;

    if (!hasLocation) {
      const where = this.buildPublicWhere(filter);
      const orderBy = this.buildOrderBy(filter.sort);
      const [items, total] = await this.prisma.$transaction([
        this.prisma.store.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: storeListInclude }),
        this.prisma.store.count({ where }),
      ]);
      return { items, total, page, limit };
    }

    const radius = filter.radius ?? 10;
    const nearby = await this.getStoresWithinRadius(filter.userLat!, filter.userLng!, radius);

    if (nearby.length === 0) {
      return { items: [], total: 0, page, limit };
    }

    const distanceMap = new Map(nearby.map((r) => [r.id, r.distance]));
    const nearbyIds = nearby.map((r) => r.id);
    const baseWhere = { ...this.buildPublicWhere(filter), id: { in: nearbyIds } };

    if (filter.sort === 'distance') {
      // Lọc theo các điều kiện khác trước để có đúng tập kết quả, rồi paginate theo thứ tự distance
      const matched = await this.prisma.store.findMany({ where: baseWhere, select: { id: true } });
      const matchedSet = new Set(matched.map((s) => s.id));
      const filteredNearby = nearby.filter((r) => matchedSet.has(r.id));
      const total = filteredNearby.length;
      const pageSlice = filteredNearby.slice((page - 1) * limit, page * limit);
      const pageIds = pageSlice.map((r) => r.id);
      const pageItems = await this.prisma.store.findMany({ where: { id: { in: pageIds } }, include: storeListInclude });
      const items = pageIds.map((id) => ({ ...pageItems.find((s) => s.id === id)!, distance: distanceMap.get(id) }));
      return { items, total, page, limit };
    }

    const orderBy = this.buildOrderBy(filter.sort);
    const [rawItems, total] = await this.prisma.$transaction([
      this.prisma.store.findMany({ where: baseWhere, orderBy, skip: (page - 1) * limit, take: limit, include: storeListInclude }),
      this.prisma.store.count({ where: baseWhere }),
    ]);
    const items = rawItems.map((s) => ({ ...s, distance: distanceMap.get(s.id) }));
    return { items, total, page, limit };
  }

  private async getStoresWithinRadius(lat: number, lng: number, radius: number) {
    return this.prisma.$queryRaw<{ id: string; distance: number }[]>`
      SELECT id,
        ROUND(
          6371 * ACOS(
            LEAST(1, COS(RADIANS(${lat})) * COS(RADIANS(latitude)) *
            COS(RADIANS(longitude) - RADIANS(${lng})) +
            SIN(RADIANS(${lat})) * SIN(RADIANS(latitude)))
          ), 2
        ) AS distance
      FROM stores
      WHERE status = 'ACTIVE'
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      HAVING distance <= ${radius}
      ORDER BY distance ASC
    `;
  }

  async findOne(idOrSlug: string) {
    const store = await this.prisma.store.findFirst({
      where: {
        status: StoreStatus.ACTIVE,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: storeDetailInclude,
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async findMine(ownerId: string) {
    const stores = await this.prisma.store.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: storeListInclude,
    });
    return stores.map((s) => this.mapStoreOwnerView(s));
  }

  async findMyShops(userId: string) {
    const memberships = await this.prisma.userRole.findMany({
      where: { userId, shopId: { not: null } },
      include: {
        role: { select: { id: true, name: true, code: true } },
        shop: {
          select: { id: true, name: true, slug: true, logoUrl: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships
      .filter((m) => m.shop !== null)
      .map((m) => ({
        shopId: m.shop!.id,
        name: m.shop!.name,
        slug: m.shop!.slug,
        logoUrl: m.shop!.logoUrl,
        status: m.shop!.status,
        roleId: m.role.id,
        roleCode: m.role.code,
        roleName: m.role.name,
      }));
  }

  async update(id: string, ownerId: string, dto: UpdateStoreDto) {
    await this.checkOwnership(id, ownerId);
    return this.mapStoreOwnerView(
      await this.prisma.store.update({
        where: { id },
        data: dto,
        include: storeListInclude,
      }),
    );
  }

  async updateWorkingHours(id: string, ownerId: string, dto: UpdateWorkingHoursDto) {
    await this.checkOwnership(id, ownerId);
    this.assertValidWorkingHours(dto);

    await this.prisma.$transaction(async (tx) => {
      for (const hour of dto.hours) {
        await tx.workingHour.upsert({
          where: { storeId_dayOfWeek: { storeId: id, dayOfWeek: hour.dayOfWeek } },
          update: {
            openTime: hour.openTime,
            closeTime: hour.closeTime,
            isClosed: hour.isClosed,
          },
          create: {
            storeId: id,
            dayOfWeek: hour.dayOfWeek,
            openTime: hour.openTime,
            closeTime: hour.closeTime,
            isClosed: hour.isClosed,
          },
        });
      }
    });

    return this.prisma.workingHour.findMany({
      where: { storeId: id },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async uploadLogo(id: string, ownerId: string, filePath: string) {
    await this.checkOwnership(id, ownerId);
    return this.prisma.store.update({
      where: { id },
      data: { logoUrl: filePath },
      select: { id: true, logoUrl: true },
    });
  }

  async uploadBanner(id: string, ownerId: string, filePath: string) {
    await this.checkOwnership(id, ownerId);
    return this.prisma.store.update({
      where: { id },
      data: { bannerUrl: filePath },
      select: { id: true, bannerUrl: true },
    });
  }

  async linkTelegramGroup(storeId: string, ownerId: string, telegramGroupId: string | null) {
    await this.checkOwnership(storeId, ownerId);
    return this.prisma.store.update({
      where: { id: storeId },
      data: { telegramGroupId },
      select: { id: true, name: true, telegramGroupId: true },
    });
  }

  async checkOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store not found');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('You do not have permission to manage this store');
    }
    if (store.status === StoreStatus.BANNED) {
      throw new ForbiddenException('Store is locked');
    }
    return store;
  }

  private buildPublicWhere(filter: StoreFilterDto): Prisma.StoreWhereInput {
    return {
      status: StoreStatus.ACTIVE,
      ...(filter.provinceId && { provinceId: filter.provinceId }),
      ...(filter.wardId && { wardId: filter.wardId }),
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q } },
          { address: { contains: filter.q } },
          { description: { contains: filter.q } },
        ],
      }),
      ...((filter.minRating || filter.maxRating) && {
        avgRating: {
          ...(filter.minRating && { gte: filter.minRating }),
          ...(filter.maxRating && { lte: filter.maxRating }),
        },
      }),
      ...(filter.categoryId && {
        services: {
          some: {
            status: 'ACTIVE',
            OR: [
              { category: { parentId: filter.categoryId } },
              { categoryId: filter.categoryId },
            ],
          },
        },
      }),
    };
  }

  private buildOrderBy(sort?: StoreFilterDto['sort']): Prisma.StoreOrderByWithRelationInput {
    if (sort === 'newest') return { createdAt: 'desc' };
    if (sort === 'name') return { name: 'asc' };
    return { avgRating: 'desc' };
  }

  private async generateUniqueSlug(name: string, provinceId?: number) {
    let provinceName = '';
    if (provinceId) {
      const province = await this.prisma.province.findUnique({ where: { id: provinceId } });
      if (province) provinceName = province.name;
    }
    const base = this.slugify(provinceName ? `${name} ${provinceName}` : name) || 'store';
    let slug = base;
    let suffix = 2;
    while (await this.prisma.store.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix++}`;
    }
    return slug;
  }

  private mapStoreOwnerView<T extends { telegramGroupId: string | null }>(store: T): T & { telegramGroupLinked: boolean } {
    return { ...store, telegramGroupLinked: store.telegramGroupId !== null };
  }

  private slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private assertValidWorkingHours(dto: UpdateWorkingHoursDto) {
    const seen = new Set<DayOfWeek>();
    for (const hour of dto.hours) {
      if (seen.has(hour.dayOfWeek)) {
        throw new BadRequestException(`Duplicate working hour for ${hour.dayOfWeek}`);
      }
      seen.add(hour.dayOfWeek);
      if (!hour.isClosed && this.toMinutes(hour.openTime) >= this.toMinutes(hour.closeTime)) {
        throw new BadRequestException('openTime must be before closeTime');
      }
    }
  }

  private toMinutes(value: string) {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
