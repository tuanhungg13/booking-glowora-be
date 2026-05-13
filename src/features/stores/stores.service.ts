import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DayOfWeek, Prisma, StoreStatus } from '@prisma/client';
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
  _count: { select: { services: true, reviews: true, staff: true } },
} as const;

const storeDetailInclude = {
  ...storeListInclude,
  services: {
    where: { status: 'ACTIVE' as const },
    include: { category: true },
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
    const existingStore = await this.prisma.store.findFirst({
      where: {
        ownerId,
        name: dto.name,
        address: dto.address,
        city: dto.city,
      },
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

    const slug = await this.generateUniqueSlug(dto.name, dto.city);

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
          city: dto.city,
          district: dto.district,
          status: StoreStatus.PENDING,
          slotIntervalMins: dto.slotIntervalMins,
          cancelBeforeHours: dto.cancelBeforeHours,
          maxAdvanceDays: dto.maxAdvanceDays,
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
    const where = this.buildPublicWhere(filter);
    const orderBy = this.buildOrderBy(filter.sort);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.store.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: storeListInclude,
      }),
      this.prisma.store.count({ where }),
    ]);

    return { items, total, page, limit };
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
    return this.prisma.store.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: storeListInclude,
    });
  }

  async update(id: string, ownerId: string, dto: UpdateStoreDto) {
    await this.checkOwnership(id, ownerId);
    return this.prisma.store.update({
      where: { id },
      data: dto,
      include: storeListInclude,
    });
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
      ...(filter.city && { city: { contains: filter.city } }),
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q } },
          { address: { contains: filter.q } },
          { description: { contains: filter.q } },
        ],
      }),
      ...(filter.minRating && { avgRating: { gte: filter.minRating } }),
      ...(filter.categoryId && {
        services: {
          some: {
            categoryId: filter.categoryId,
            status: 'ACTIVE',
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

  private async generateUniqueSlug(name: string, city: string) {
    const base = this.slugify(`${name} ${city}`) || 'store';
    let slug = base;
    let suffix = 2;
    while (await this.prisma.store.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix++}`;
    }
    return slug;
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
