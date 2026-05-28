import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminStoreActionDto } from './dto/admin-store-action.dto';
import { AdminStoreFilterDto } from './dto/store-filter.dto';

const adminStoreInclude = {
  owner: { select: { id: true, fullName: true, email: true, phone: true } },
  approvedBy: { select: { id: true, fullName: true, email: true } },
  workingHours: { orderBy: { dayOfWeek: 'asc' as const } },
  _count: { select: { services: true, reviews: true, staff: true, appointments: true } },
} as const;

@Injectable()
export class AdminStoresService {
  constructor(private readonly prisma: PrismaService) {}

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

  async approve(id: string, adminId: string) {
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

    return updated;
  }

  async reject(id: string, dto: AdminStoreActionDto) {
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

    return updated;
  }

  async lock(id: string, dto: AdminStoreActionDto) {
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

    return updated;
  }

  async unlock(id: string) {
    const store = await this.findOne(id);
    if (store.status !== StoreStatus.BANNED) {
      throw new BadRequestException('Only banned stores can be unlocked');
    }

    return this.prisma.store.update({
      where: { id },
      data: {
        status: StoreStatus.ACTIVE,
        rejectionReason: null,
      },
      include: adminStoreInclude,
    });
  }
}
