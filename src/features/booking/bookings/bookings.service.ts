import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications/notifications.service';
import { BookingFilterDto } from './dto/booking-filter.dto';
import { MyBookingFilterDto } from './dto/my-booking-filter.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

const bookingInclude = {
  customer: { select: { id: true, fullName: true, email: true, phone: true } },
  store: true,
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      service: true,
      variant: true,
      staff: {
        include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
      },
      review: true,
    },
  },
  payments: true,
} as const;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateBookingDto, customerId: string) {
    if (dto.services.length === 0) {
      throw new BadRequestException('Phải chọn ít nhất 1 dịch vụ');
    }

    const isShopMember = await this.prisma.userRole.findFirst({
      where: { userId: customerId, shopId: dto.storeId },
    });
    if (isShopMember) {
      throw new ForbiddenException('Không thể đặt lịch tại cơ sở bạn đang làm việc');
    }

    const booking = await this.prisma.$transaction(
      async (tx) => {
        const store = await tx.store.findUnique({ where: { id: dto.storeId } });
        if (!store || store.status !== StoreStatus.ACTIVE) {
          throw new NotFoundException('Store not found or inactive');
        }

        let currentTime = new Date(dto.scheduledAt);
        const itemsData: Array<{
          sortOrder: number;
          serviceId: string;
          variantId: string;
          staffId: string;
          startTime: Date;
          duration: number;
          price: Prisma.Decimal;
        }> = [];

        for (let i = 0; i < dto.services.length; i++) {
          const svc = dto.services[i];

          const variant = await tx.serviceVariant.findFirst({
            where: {
              id: svc.variantId,
              serviceId: svc.serviceId,
              status: ServiceStatus.ACTIVE,
              service: { shopId: dto.storeId, status: ServiceStatus.ACTIVE },
            },
          });
          if (!variant) {
            throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);
          }

          let staffId: string;
          if (svc.staffId) {
            const canDo = await tx.staffService.findFirst({
              where: { staffId: svc.staffId, serviceId: svc.serviceId },
            });
            if (!canDo) {
              throw new BadRequestException(`Nhân viên không thực hiện được dịch vụ thứ ${i + 1}`);
            }
            staffId = svc.staffId;
          } else {
            const found = await this.pickAvailableStaff(tx, dto.storeId, svc.serviceId, currentTime, variant.duration);
            if (!found) {
              throw new ConflictException(`Không có nhân viên khả dụng cho dịch vụ thứ ${i + 1}`);
            }
            staffId = found;
          }

          await this.assertNoOverlap(tx, staffId, currentTime, variant.duration);

          itemsData.push({
            sortOrder: i,
            serviceId: svc.serviceId,
            variantId: variant.id,
            staffId,
            startTime: new Date(currentTime),
            duration: variant.duration,
            price: variant.price,
          });

          currentTime = new Date(currentTime.getTime() + variant.duration * 60 * 1000);
        }

        const totalDuration = itemsData.reduce((sum, item) => sum + item.duration, 0);
        const totalPrice = itemsData.reduce((sum, item) => sum + Number(item.price), 0);

        return tx.booking.create({
          data: {
            customerId,
            storeId: dto.storeId,
            scheduledAt: new Date(dto.scheduledAt),
            totalDuration,
            totalPrice,
            status: store.autoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
            confirmedAt: store.autoConfirm ? new Date() : undefined,
            notes: dto.notes,
            items: { create: itemsData },
          },
          include: bookingInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const serviceNames = booking.items.map((item) => item.service.name).join(', ');
    this.notifications
      .notifyBookingCreated({
        bookingId: booking.id,
        storeId: booking.store.id,
        storeName: booking.store.name,
        customerId: booking.customer.id,
        customerName: booking.customer.fullName,
        customerEmail: booking.customer.email,
        serviceNames,
        scheduledAt: booking.scheduledAt,
      })
      .catch(() => undefined);

    return booking;
  }

  async findAll(params?: {
    storeId?: string;
    status?: BookingStatus;
    customerId?: string;
    staffId?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.BookingWhereInput = {
      ...(params?.storeId && { storeId: params.storeId }),
      ...(params?.status && { status: params.status }),
      ...(params?.customerId && { customerId: params.customerId }),
      ...(params?.staffId && { items: { some: { staffId: params.staffId } } }),
      ...((params?.from || params?.to) && {
        scheduledAt: {
          ...(params.from && { gte: params.from }),
          ...(params.to && { lte: params.to }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { scheduledAt: 'desc' },
        include: bookingInclude,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { items, total };
  }

  async findMy(customerId: string, filter: MyBookingFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {
      customerId,
      ...(filter.status && { status: filter.status }),
      ...((filter.from || filter.to) && {
        scheduledAt: {
          ...(filter.from && { gte: new Date(filter.from) }),
          ...(filter.to && { lte: new Date(filter.to) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: bookingInclude,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findStoreBookings(storeId: string, filter: BookingFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {
      storeId,
      ...(filter.status && { status: filter.status }),
      ...((filter.from || filter.to) && {
        scheduledAt: {
          ...(filter.from && { gte: new Date(filter.from) }),
          ...(filter.to && { lte: new Date(filter.to) }),
        },
      }),
      ...(filter.search && {
        OR: [
          { customer: { fullName: { contains: filter.search } } },
          { customer: { email: { contains: filter.search } } },
          { customer: { phone: { contains: filter.search } } },
          { id: { contains: filter.search } },
        ],
      }),
      AND: [
        ...(filter.staffId ? [{ items: { some: { staffId: filter.staffId } } }] : []),
        ...(filter.serviceId ? [{ items: { some: { serviceId: filter.serviceId } } }] : []),
        ...(filter.paymentStatus ? [{ payments: { some: { status: filter.paymentStatus } } }] : []),
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: bookingInclude,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findCalendar(storeId: string, month: string, status?: BookingStatus, staffId?: string) {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));

    return this.prisma.booking.findMany({
      where: {
        storeId,
        scheduledAt: { gte: start, lt: end },
        ...(status && { status }),
        ...(staffId && { items: { some: { staffId } } }),
      },
      orderBy: { scheduledAt: 'asc' },
      include: bookingInclude,
    });
  }

  async findOne(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async confirm(id: string, userId: string) {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be confirmed');
    }
    await this.assertShopMember(userId, booking.storeId);

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
      include: bookingInclude,
    });

    this.notifications
      .notifyBookingConfirmed({
        bookingId: id,
        customerId: updated.customer.id,
        customerEmail: updated.customer.email,
        storeName: updated.store.name,
        serviceNames: updated.items.map((i) => i.service.name).join(', '),
        scheduledAt: updated.scheduledAt,
      })
      .catch(() => undefined);

    return updated;
  }

  async reject(id: string, userId: string, reason: string) {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be rejected');
    }
    await this.assertShopMember(userId, booking.storeId);

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.REJECTED, cancellationReason: reason },
      include: bookingInclude,
    });

    this.notifications
      .notifyBookingRejected({
        bookingId: id,
        customerId: updated.customer.id,
        customerEmail: updated.customer.email,
        storeName: updated.store.name,
        serviceNames: updated.items.map((i) => i.service.name).join(', '),
        reason,
      })
      .catch(() => undefined);

    return updated;
  }

  async complete(id: string, userId: string) {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }
    await this.assertShopMember(userId, booking.storeId);

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.COMPLETED, completedAt: new Date() },
      include: bookingInclude,
    });

    this.notifications
      .notifyBookingCompleted({
        bookingId: id,
        customerId: updated.customer.id,
        customerEmail: updated.customer.email,
        storeName: updated.store.name,
        serviceNames: updated.items.map((i) => i.service.name).join(', '),
      })
      .catch(() => undefined);

    return updated;
  }

  async cancel(id: string, userId: string, reason?: string) {
    const booking = await this.findOne(id);

    if (booking.customerId !== userId) {
      throw new ForbiddenException('Bạn không phải chủ lịch hẹn này');
    }
    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new BadRequestException('Only pending or confirmed bookings can be cancelled');
    }

    const deadline = booking.scheduledAt.getTime() - booking.store.cancelBeforeHours * 60 * 60 * 1000;
    if (Date.now() > deadline) {
      throw new BadRequestException(`Chỉ được hủy trước ${booking.store.cancelBeforeHours} giờ`);
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
      include: bookingInclude,
    });

    this.notifications
      .notifyBookingCancelled({
        bookingId: id,
        storeId: updated.store.id,
        storeName: updated.store.name,
        customerId: updated.customer.id,
        customerName: updated.customer.fullName,
        customerEmail: updated.customer.email,
        serviceNames: updated.items.map((i) => i.service.name).join(', '),
        reason,
      })
      .catch(() => undefined);

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.booking.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertShopMember(userId: string, storeId: string) {
    const userRole = await this.prisma.userRole.findFirst({
      where: { userId, shopId: storeId },
    });
    if (!userRole) throw new ForbiddenException('Bạn không phải nhân viên của cơ sở này');
  }

  private async pickAvailableStaff(
    tx: Prisma.TransactionClient,
    storeId: string,
    serviceId: string,
    startTime: Date,
    duration: number,
  ): Promise<string | null> {
    const mappings = await tx.staffService.findMany({
      where: { serviceId, staff: { storeId, status: 'ACTIVE' } },
      select: { staffId: true },
    });
    for (const { staffId } of mappings) {
      const overlap = await this.findOverlap(tx, staffId, startTime, duration);
      if (!overlap) return staffId;
    }
    return null;
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    staffId: string,
    startTime: Date,
    duration: number,
  ) {
    const overlap = await this.findOverlap(tx, staffId, startTime, duration);
    if (overlap) throw new ConflictException('Slot này vừa được đặt');
  }

  private async findOverlap(
    tx: Prisma.TransactionClient,
    staffId: string,
    startTime: Date,
    duration: number,
  ) {
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    // Widen query window ±24h to handle all timezone offsets safely
    const windowMin = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);
    const windowMax = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);

    const busyItems = await tx.bookingItem.findMany({
      where: {
        staffId,
        booking: { status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] } },
        startTime: { gte: windowMin, lte: windowMax },
      },
      select: { startTime: true, duration: true },
    });

    return busyItems.find((item) => {
      const itemEnd = new Date(item.startTime.getTime() + item.duration * 60 * 1000);
      return startTime < itemEnd && item.startTime < endTime;
    });
  }
}
