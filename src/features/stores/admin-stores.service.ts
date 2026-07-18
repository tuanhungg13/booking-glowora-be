import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, NotificationType, Prisma, StoreStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminStoreActionDto } from './dto/admin-store-action.dto';
import { AdminStoreFilterDto } from './dto/store-filter.dto';

const adminStoreInclude = {
  owner: { select: { id: true, fullName: true, email: true, phone: true } },
  approvedBy: { select: { id: true, fullName: true, email: true } },
  workingHours: { orderBy: { dayOfWeek: 'asc' as const } },
  _count: { select: { services: true, reviews: true, staff: true, bookings: true } },
} as const;

// Chỉ chứa các field trang danh sách admin thực sự render — không select CCCD/giấy phép
// kinh doanh và các field cấu hình nội bộ ở đây để tránh lộ dữ liệu nhạy cảm cho mọi item
// trong danh sách phân trang. Field đầy đủ chỉ trả ở findOne (trang chi tiết).
const adminStoreListSelect = {
  id: true,
  name: true,
  address: true,
  status: true,
  createdAt: true,
  owner: { select: { id: true, fullName: true, email: true } },
  _count: { select: { services: true, reviews: true } },
} as const;

@Injectable()
export class AdminStoresService {
  constructor(
    private readonly prisma: PrismaService,
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
        select: adminStoreListSelect,
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
    if (!store) throw new NotFoundException('Không tìm thấy cửa hàng');
    return store;
  }

  async approve(id: string, adminId: string, ipAddress?: string, requestId?: string) {
    const store = await this.findOne(id);
    if (store.status !== StoreStatus.PENDING && store.status !== StoreStatus.INACTIVE) {
      throw new BadRequestException('Chỉ có thể duyệt cửa hàng đang chờ hoặc chưa kích hoạt');
    }
    if (store.ownerId === adminId) {
      throw new BadRequestException('Admin không thể tự duyệt cửa hàng của mình');
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

    return updated;
  }

  async reject(id: string, dto: AdminStoreActionDto, adminId: string, ipAddress?: string, requestId?: string) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Vui lòng nhập lý do từ chối');
    }

    const store = await this.findOne(id);
    if (store.status !== StoreStatus.PENDING && store.status !== StoreStatus.INACTIVE) {
      throw new BadRequestException('Chỉ có thể từ chối cửa hàng đang chờ hoặc chưa kích hoạt');
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

    return updated;
  }

  async lock(id: string, dto: AdminStoreActionDto, adminId: string, ipAddress?: string, requestId?: string) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Vui lòng nhập lý do khóa');
    }

    const store = await this.findOne(id);
    if (store.status !== StoreStatus.ACTIVE) {
      throw new BadRequestException('Chỉ có thể khóa cửa hàng đang hoạt động');
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

    return updated;
  }

  async unlock(id: string, adminId: string, ipAddress?: string, requestId?: string) {
    const store = await this.findOne(id);
    if (store.status !== StoreStatus.BANNED) {
      throw new BadRequestException('Chỉ có thể mở khóa cửa hàng đang bị khóa');
    }

    const updated = await this.prisma.store.update({
      where: { id },
      data: {
        status: StoreStatus.ACTIVE,
        rejectionReason: null,
      },
      include: adminStoreInclude,
    });

    return updated;
  }
}
