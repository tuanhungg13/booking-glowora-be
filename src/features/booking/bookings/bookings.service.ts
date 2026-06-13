import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, DayOfWeek, DayOffStatus, LogType, PaymentStatus, Prisma, ServiceStatus, StoreStatus } from '@prisma/client';

const TZ_OFFSETS: Record<string, number> = {
  'Asia/Ho_Chi_Minh': 7 * 60,
  'Asia/Bangkok': 7 * 60,
  'Asia/Saigon': 7 * 60,
  'Asia/Jakarta': 7 * 60,
  'Asia/Singapore': 8 * 60,
  'Asia/Kuala_Lumpur': 8 * 60,
  UTC: 0,
};

const DOW_MAP: DayOfWeek[] = [
  DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY,
];
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications/notifications.service';
import { SystemLogService } from '../../../system-log/system-log.service';
import { BookingFilterDto } from './dto/booking-filter.dto';
import { MyBookingFilterDto } from './dto/my-booking-filter.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CouponsService } from '../coupons/coupons.service';
import { PromotionsService } from '../promotions/promotions.service';

const bookingInclude = {
  customer: { select: { id: true, fullName: true, email: true, phone: true } },
  store: true,
  coupon: { select: { id: true, code: true, type: true, value: true } },
  promotion: { select: { id: true, name: true, type: true, value: true, scope: true } },
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
    private readonly systemLog: SystemLogService,
    private readonly coupons: CouponsService,
    private readonly promotions: PromotionsService,
  ) {}

  async create(dto: CreateBookingDto, customerId: string, ipAddress?: string, requestId?: string) {
    if (dto.services.length === 0) {
      throw new BadRequestException('Phải chọn ít nhất 1 dịch vụ');
    }

    const isStoreMember = await this.prisma.userRole.findFirst({
      where: { userId: customerId, storeId: dto.storeId },
    });
    if (isStoreMember) {
      throw new ForbiddenException(
        'Bạn là chủ hoặc nhân viên của cơ sở này nên không thể đặt lịch tại đây. Vui lòng sử dụng tài khoản khách hàng khác để đặt lịch.',
      );
    }

    // Fetch active promotion ngoài transaction (read-only, không cần lock)
    const activePromotion = await this.promotions.findActiveForStore(dto.storeId);

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
          originalPrice: Prisma.Decimal | null;
          price: Prisma.Decimal;
          serviceName: string;
          variantName: string;
          staffName: string | null;
          isStaffChosenByCustomer: boolean;
        }> = [];

        for (let i = 0; i < dto.services.length; i++) {
          const svc = dto.services[i];

          const variant = await tx.serviceVariant.findFirst({
            where: {
              id: svc.variantId,
              serviceId: svc.serviceId,
              status: ServiceStatus.ACTIVE,
              service: { storeId: dto.storeId, status: ServiceStatus.ACTIVE },
            },
            include: { service: { select: { name: true } } },
          });
          if (!variant) {
            throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);
          }

          let staffId: string;
          let isStaffChosenByCustomer = false;
          if (svc.staffId) {
            const canDo = await tx.staff.findFirst({
              where: { id: svc.staffId, storeId: dto.storeId, status: 'ACTIVE' },
            });
            if (!canDo) {
              throw new BadRequestException(`Nhân viên không thực hiện được dịch vụ thứ ${i + 1}`);
            }
            staffId = svc.staffId;
            isStaffChosenByCustomer = true;
          } else {
            const found = await this.pickAvailableStaff(tx, dto.storeId, svc.serviceId, currentTime, variant.duration, store.timezone);
            if (!found) {
              throw new ConflictException(`Không có nhân viên khả dụng cho dịch vụ thứ ${i + 1}`);
            }
            staffId = found;
          }

          await this.assertNoOverlap(tx, staffId, currentTime, variant.duration);

          const staffRecord = await tx.staff.findUnique({
            where: { id: staffId },
            select: { user: { select: { fullName: true } } },
          });

          // Apply promotion per item nếu có và service nằm trong scope
          let itemPrice = variant.price;
          let originalPrice: Prisma.Decimal | null = null;
          if (activePromotion) {
            const variantWithService = await tx.serviceVariant.findUnique({
              where: { id: variant.id },
              include: { service: { select: { categoryId: true } } },
            });
            const categoryId = variantWithService?.service.categoryId ?? null;
            if (this.promotions.isServiceInScope(activePromotion, svc.serviceId, categoryId)) {
              const saving = this.promotions.calcDiscount(activePromotion, Number(variant.price));
              originalPrice = variant.price;
              itemPrice = new Prisma.Decimal(Number(variant.price) - saving);
            }
          }

          itemsData.push({
            sortOrder: i,
            serviceId: svc.serviceId,
            variantId: variant.id,
            staffId,
            startTime: new Date(currentTime),
            duration: variant.duration,
            originalPrice,
            price: itemPrice,
            serviceName: variant.service.name,
            variantName: variant.name,
            staffName: staffRecord?.user?.fullName ?? null,
            isStaffChosenByCustomer,
          });

          currentTime = new Date(currentTime.getTime() + variant.duration * 60 * 1000);
        }

        const totalDuration = itemsData.reduce((sum, item) => sum + item.duration, 0);
        // totalPrice = tổng giá đã áp dụng promotion (price per item đã giảm nếu có)
        const totalPriceNum = itemsData.reduce((sum, item) => sum + Number(item.price), 0);
        const totalPrice = new Prisma.Decimal(totalPriceNum);

        // promotionDiscount = tổng tiết kiệm từ promotion (chỉ dùng để hiển thị)
        const promotionDiscountNum = itemsData.reduce(
          (sum, item) => sum + (item.originalPrice ? Number(item.originalPrice) - Number(item.price) : 0),
          0,
        );
        const promotionDiscount = new Prisma.Decimal(promotionDiscountNum);
        const promotionId = promotionDiscountNum > 0 ? activePromotion!.id : null;

        let couponId: string | null = null;
        let discountAmount = new Prisma.Decimal(0);

        if (dto.couponCode) {
          const result = await this.coupons.applyToBooking(
            tx,
            dto.couponCode,
            dto.storeId,
            totalPrice,
            customerId,
          );
          couponId = result.couponId;
          discountAmount = result.discountAmount;
        }

        const finalPrice = totalPrice.sub(discountAmount);

        const booking = await tx.booking.create({
          data: {
            customerId,
            storeId: dto.storeId,
            scheduledAt: new Date(dto.scheduledAt),
            totalDuration,
            totalPrice,
            promotionDiscount,
            discountAmount,
            finalPrice,
            couponId,
            promotionId,
            status: store.autoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
            confirmedAt: store.autoConfirm ? new Date() : undefined,
            notes: dto.notes,
            items: { create: itemsData },
          },
          include: bookingInclude,
        });

        if (couponId) {
          await this.coupons.recordUsage(tx, couponId, customerId, booking.id, discountAmount);
        }

        return booking;
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

    this.systemLog.log({ type: LogType.BOOKING_CREATED, actorId: customerId, storeId: booking.storeId, targetId: booking.id, targetType: 'Booking', metadata: { scheduledAt: booking.scheduledAt, totalPrice: Number(booking.totalPrice) }, ipAddress, requestId });

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
      ...(filter.search && { id: { contains: filter.search } }),
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

    const andConditions: Prisma.BookingWhereInput[] = [
      ...(filter.staffId ? [{ items: { some: { staffId: filter.staffId } } }] : []),
      ...(filter.serviceId ? [{ items: { some: { serviceId: filter.serviceId } } }] : []),
      ...(filter.paymentStatus ? [{ payments: { some: { status: filter.paymentStatus } } }] : []),
    ];

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
      ...(andConditions.length > 0 && { AND: andConditions }),
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

  async findOneForUser(id: string, userId: string) {
    const booking = await this.findOne(id);
    await this.assertBookingReadable(userId, booking);
    return booking;
  }

  async findOneForStore(id: string, storeId: string) {
    const booking = await this.findOne(id);
    if (booking.storeId !== storeId) throw new NotFoundException('Booking not found');
    return booking;
  }

  async confirm(id: string, userId: string, ipAddress?: string, requestId?: string) {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be confirmed');
    }
    await this.assertStoreMember(userId, booking.storeId);

    const now = new Date();
    const depositPercent = booking.store.depositPercent;
    let updateData: Prisma.BookingUpdateInput;
    let needsDeposit = false;

    if (depositPercent > 0) {
      const paymentConfig = await this.prisma.storePaymentConfig.findUnique({
        where: { storeId: booking.storeId },
        select: { isActive: true },
      });
      if (paymentConfig?.isActive) {
        const deadline = this.calcDepositDeadline(now, booking.scheduledAt);
        if (deadline) {
          const rawPrice = Number(booking.finalPrice) > 0 ? Number(booking.finalPrice) : Number(booking.totalPrice);
          const depositAmount = new Prisma.Decimal(Math.ceil(rawPrice * depositPercent / 100));
          updateData = { status: BookingStatus.DEPOSIT_PENDING, confirmedAt: now, depositAmount, depositDeadline: deadline };
          needsDeposit = true;
        } else {
          updateData = { status: BookingStatus.CONFIRMED, confirmedAt: now };
        }
      } else {
        updateData = { status: BookingStatus.CONFIRMED, confirmedAt: now };
      }
    } else {
      updateData = { status: BookingStatus.CONFIRMED, confirmedAt: now };
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: updateData,
      include: bookingInclude,
    });

    const serviceNames = updated.items.map((i) => i.service.name).join(', ');

    if (needsDeposit) {
      this.notifications
        .notifyDepositRequired({
          bookingId: id,
          customerId: updated.customer.id,
          customerEmail: updated.customer.email,
          customerName: updated.customer.fullName,
          storeName: updated.store.name,
          serviceNames,
          scheduledAt: updated.scheduledAt,
          depositAmount: Number(updated.depositAmount),
          depositDeadline: updated.depositDeadline!,
        })
        .catch(() => undefined);
    } else {
      this.notifications
        .notifyBookingConfirmed({
          bookingId: id,
          customerId: updated.customer.id,
          customerEmail: updated.customer.email,
          storeName: updated.store.name,
          serviceNames,
          scheduledAt: updated.scheduledAt,
        })
        .catch(() => undefined);
    }

    this.systemLog.log({ type: LogType.BOOKING_CONFIRMED, actorId: userId, storeId: updated.storeId, targetId: id, targetType: 'Booking', metadata: { customerId: updated.customerId, needsDeposit }, ipAddress, requestId });

    return updated;
  }

  private calcDepositDeadline(confirmedAt: Date, scheduledAt: Date): Date | null {
    const gapH = (scheduledAt.getTime() - confirmedAt.getTime()) / (1000 * 60 * 60);
    if (gapH > 7 * 24) return new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
    if (gapH > 24) return new Date(confirmedAt.getTime() + 6 * 60 * 60 * 1000);
    if (gapH > 6) return new Date(confirmedAt.getTime() + 2 * 60 * 60 * 1000);
    if (gapH > 2) return new Date(confirmedAt.getTime() + 60 * 60 * 1000);
    return null; // < 2h so lịch → miễn cọc
  }

  async reject(id: string, userId: string, reason: string, ipAddress?: string, requestId?: string) {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be rejected');
    }
    await this.assertStoreMember(userId, booking.storeId);

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

    this.systemLog.log({ type: LogType.BOOKING_REJECTED, actorId: userId, storeId: updated.storeId, targetId: id, targetType: 'Booking', metadata: { customerId: updated.customerId, reason }, ipAddress, requestId });

    return updated;
  }

  async complete(id: string, userId: string, ipAddress?: string, requestId?: string) {
    const booking = await this.findOne(id);
    if (
      booking.status !== BookingStatus.CONFIRMED &&
      booking.status !== BookingStatus.DEPOSIT_PAID &&
      booking.status !== BookingStatus.PAID
    ) {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }
    await this.assertStoreMember(userId, booking.storeId);

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

    this.systemLog.log({ type: LogType.BOOKING_COMPLETED, actorId: userId, storeId: updated.storeId, targetId: id, targetType: 'Booking', metadata: { customerId: updated.customerId }, ipAddress, requestId });

    return updated;
  }

  async cancel(id: string, userId: string, reason?: string, ipAddress?: string) {
    const booking = await this.findOne(id);

    if (booking.customerId !== userId) {
      throw new ForbiddenException('Bạn không phải chủ lịch hẹn này');
    }
    const cancellableStatuses: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
      BookingStatus.DEPOSIT_PENDING,
      BookingStatus.DEPOSIT_PAID,
      BookingStatus.PAID,
    ];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestException('Only pending or confirmed bookings can be cancelled');
    }

    const deadline = booking.scheduledAt.getTime() - booking.store.cancelBeforeHours * 60 * 60 * 1000;
    if (Date.now() > deadline) {
      throw new BadRequestException(`Chỉ được hủy trước ${booking.store.cancelBeforeHours} giờ`);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
        include: bookingInclude,
      }),
      this.prisma.payment.updateMany({
        where: { bookingId: id, status: PaymentStatus.PAID },
        data: { status: PaymentStatus.REFUNDED },
      }),
    ]);

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

    this.systemLog.log({ type: LogType.BOOKING_CANCELLED, actorId: userId, storeId: updated.storeId, targetId: id, targetType: 'Booking', metadata: { reason }, ipAddress });

    return updated;
  }

  async remove(id: string, userId: string) {
    const booking = await this.findOne(id);
    await this.assertStoreMember(userId, booking.storeId);
    await this.prisma.booking.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertBookingReadable(
    userId: string,
    booking: { customerId: string; storeId: string },
  ) {
    if (booking.customerId === userId) return;
    await this.assertStoreMember(userId, booking.storeId);
  }

  private async assertStoreMember(userId: string, storeId: string) {
    const userRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        OR: [{ storeId }, { storeId: null, role: { code: 'SUPER_ADMIN' } }],
      },
    });
    if (!userRole) throw new ForbiddenException('Bạn không phải nhân viên của cơ sở này');
  }

  private async pickAvailableStaff(
    tx: Prisma.TransactionClient,
    storeId: string,
    serviceId: string,
    startTime: Date,
    duration: number,
    timezone: string,
  ): Promise<string | null> {
    const tzOffset = TZ_OFFSETS[timezone] ?? 7 * 60;
    const localDate = new Date(startTime.getTime() + tzOffset * 60 * 1000);
    const dayOfWeek = DOW_MAP[localDate.getUTCDay()];
    const dateStr = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, '0')}-${String(localDate.getUTCDate()).padStart(2, '0')}`;
    const dateUTCMidnight = new Date(`${dateStr}T00:00:00.000Z`);
    const localStartMins = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
    const localEndMins = localStartMins + duration;

    const mappings = await tx.staff.findMany({
      where: { storeId, status: 'ACTIVE' },
      select: { id: true },
    });

    for (const { id: staffId } of mappings) {
      const [schedule, dayOff] = await Promise.all([
        tx.staffSchedule.findFirst({ where: { staffId, dayOfWeek, isActive: true } }),
        tx.staffDayOff.findFirst({
          where: { staffId, date: dateUTCMidnight, startTime: null, status: { in: [DayOffStatus.PENDING, DayOffStatus.APPROVED] } },
        }),
      ]);

      if (!schedule || dayOff) continue;

      const scheduleStart = this.parseTimeMins(schedule.startTime);
      const scheduleEnd = this.parseTimeMins(schedule.endTime);
      if (localStartMins < scheduleStart || localEndMins > scheduleEnd) continue;

      const overlap = await this.findOverlap(tx, staffId, startTime, duration);
      if (!overlap) return staffId;
    }
    return null;
  }

  private parseTimeMins(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
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
        booking: { status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.DEPOSIT_PENDING, BookingStatus.DEPOSIT_PAID, BookingStatus.PAID] } },
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
