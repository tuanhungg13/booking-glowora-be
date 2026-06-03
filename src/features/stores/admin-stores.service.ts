import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, LogType, NotificationType, Prisma, StoreStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemLogService } from '../../system-log/system-log.service';
import { AdminStoreActionDto } from './dto/admin-store-action.dto';
import { AdminStoreFilterDto } from './dto/store-filter.dto';

const adminStoreInclude = {
  owner: { select: { id: true, fullName: true, email: true, phone: true } },
  approvedBy: { select: { id: true, fullName: true, email: true } },
  workingHours: { orderBy: { dayOfWeek: 'asc' as const } },
  _count: { select: { services: true, reviews: true, staff: true, bookings: true } },
} as const;

@Injectable()
export class AdminStoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLog: SystemLogService,
  ) {}

  async getStats() {
    const [
      totalStores,
      pendingStores,
      activeStores,
      bannedStores,
      totalUsers,
      bannedUsers,
      totalBookings,
      pendingBookings,
    ] = await Promise.all([
      this.prisma.store.count(),
      this.prisma.store.count({ where: { status: StoreStatus.PENDING } }),
      this.prisma.store.count({ where: { status: StoreStatus.ACTIVE } }),
      this.prisma.store.count({ where: { status: StoreStatus.BANNED } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.BANNED } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: BookingStatus.PENDING } }),
    ]);

    return {
      stores: {
        total: totalStores,
        pending: pendingStores,
        active: activeStores,
        banned: bannedStores,
      },
      users: {
        total: totalUsers,
        banned: bannedUsers,
      },
      appointments: {
        total: totalBookings,
        pending: pendingBookings,
      },
    };
  }

  async findAll(filter: AdminStoreFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where: Prisma.StoreWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.provinceId && { provinceId: filter.provinceId }),
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q } },
          { address: { contains: filter.q } },
          { owner: { email: { contains: filter.q } } },
          { owner: { fullName: { contains: filter.q } } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.store.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: adminStoreInclude,
      }),
      this.prisma.store.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: adminStoreInclude,
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async approve(id: string, adminId: string, ipAddress?: string, requestId?: string) {
    const store = await this.findOne(id);
    if (store.status !== StoreStatus.PENDING && store.status !== StoreStatus.INACTIVE) {
      throw new BadRequestException('Only pending or inactive stores can be approved');
    }
    if (store.ownerId === adminId) {
      throw new BadRequestException('Admin cannot approve their own store');
    }

    const updated = await this.prisma.store.update({
      where: { id },
      data: {
        status: StoreStatus.ACTIVE,
        approvedById: adminId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
      include: adminStoreInclude,
    });

    await this.prisma.notification.create({
      data: {
        userId: store.ownerId,
        type: NotificationType.STORE_APPROVED,
        title: 'Cơ sở được duyệt',
        body: `Cơ sở "${store.name}" của bạn đã được duyệt và hiện đang hoạt động.`,
        metadata: { storeId: id },
      },
    });

    this.systemLog.log({ type: LogType.STORE_APPROVED, actorId: adminId, storeId: id, targetId: id, targetType: 'Store', metadata: { storeName: store.name }, ipAddress, requestId });
    return updated;
  }

  async reject(id: string, dto: AdminStoreActionDto, adminId: string, ipAddress?: string, requestId?: string) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Reject reason is required');
    }

    const store = await this.findOne(id);
    if (store.status !== StoreStatus.PENDING && store.status !== StoreStatus.INACTIVE) {
      throw new BadRequestException('Only pending or inactive stores can be rejected');
    }

    const updated = await this.prisma.store.update({
      where: { id },
      data: {
        status: StoreStatus.INACTIVE,
        rejectionReason: dto.reason.trim(),
      },
      include: adminStoreInclude,
    });

    await this.prisma.notification.create({
      data: {
        userId: store.ownerId,
        type: NotificationType.STORE_REJECTED,
        title: 'Cơ sở bị từ chối',
        body: `Cơ sở "${store.name}" bị từ chối. Lý do: ${dto.reason.trim()}`,
        metadata: { storeId: id },
      },
    });

    this.systemLog.log({ type: LogType.STORE_REJECTED, actorId: adminId, storeId: id, targetId: id, targetType: 'Store', metadata: { storeName: store.name, reason: dto.reason }, ipAddress, requestId });
    return updated;
  }

  async lock(id: string, dto: AdminStoreActionDto, adminId: string, ipAddress?: string, requestId?: string) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Lock reason is required');
    }

    const store = await this.findOne(id);
    if (store.status !== StoreStatus.ACTIVE) {
      throw new BadRequestException('Only active stores can be locked');
    }

    const updated = await this.prisma.store.update({
      where: { id },
      data: {
        status: StoreStatus.BANNED,
        rejectionReason: dto.reason.trim(),
      },
      include: adminStoreInclude,
    });

    await this.prisma.notification.create({
      data: {
        userId: store.ownerId,
        type: NotificationType.STORE_LOCKED,
        title: 'Cơ sở bị khoá',
        body: `Cơ sở "${store.name}" đã bị khoá. Lý do: ${dto.reason.trim()}`,
        metadata: { storeId: id },
      },
    });

    this.systemLog.log({ type: LogType.STORE_BANNED, actorId: adminId, storeId: id, targetId: id, targetType: 'Store', metadata: { storeName: store.name, reason: dto.reason }, ipAddress, requestId });
    return updated;
  }

  async unlock(id: string, adminId: string, ipAddress?: string, requestId?: string) {
    const store = await this.findOne(id);
    if (store.status !== StoreStatus.BANNED) {
      throw new BadRequestException('Only banned stores can be unlocked');
    }

    const updated = await this.prisma.store.update({
      where: { id },
      data: {
        status: StoreStatus.ACTIVE,
        rejectionReason: null,
      },
      include: adminStoreInclude,
    });

    this.systemLog.log({ type: LogType.STORE_UNLOCKED, actorId: adminId, storeId: id, targetId: id, targetType: 'Store', metadata: { storeName: store.name }, ipAddress, requestId });
    return updated;
  }
}
