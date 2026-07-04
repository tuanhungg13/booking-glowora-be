import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, CallInStatus, DayOfWeek, DayOffStatus, LogType, PaymentStatus, Prisma, ServiceStatus, StoreStatus } from '@prisma/client';

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

// Biên an toàn khi quét các booking/item có thể overlap: chỉ cần đủ lớn hơn tổng thời lượng
// thực tế tối đa của 1 booking (dịch vụ spa hiếm khi kéo dài quá vài giờ). Trước đây dùng ±24h
// khiến InnoDB (dưới Serializable) phải gap-lock cả dải 48h quanh mỗi slot, làm 2 booking khác
// giờ/khác nhân viên (không tranh chấp thật) vẫn có thể đụng lock nhau khi 100 người đặt cùng lúc.
const OVERLAP_SCAN_MARGIN_MS = 6 * 60 * 60 * 1000; // 6h
import { PrismaService } from '../../../prisma/prisma.service';
import { retryTransaction } from '../../../prisma/transaction-retry.util';
import { NotificationsService } from '../../notifications/notifications/notifications.service';
import { SystemLogService } from '../../../system-log/system-log.service';
import { BookingFilterDto } from './dto/booking-filter.dto';
import { MyBookingFilterDto } from './dto/my-booking-filter.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateWalkInBookingDto } from './dto/create-walkin-booking.dto';
import { CouponsService } from '../coupons/coupons.service';
import { PromotionsService } from '../promotions/promotions.service';

const bookingInclude = {
  customer: { select: { id: true, fullName: true, email: true, phone: true } },
  customerProvince: { select: { id: true, name: true } },
  customerWard: { select: { id: true, name: true } },
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

// Include rút gọn cho response tạo lịch (create/createWalkIn): bỏ payments (luôn rỗng lúc
// vừa tạo, chưa có thanh toán nào), items.review (luôn null, chưa hoàn thành dịch vụ) và
// customerProvince/customerWard (không cần hiển thị ngay lúc đặt xong) — đo được dưới tải
// 100 booking đồng thời, riêng bookingInclude đầy đủ (9 bảng join) đã chiếm phần lớn độ trễ
// tạo lịch. Các trang xem chi tiết vẫn dùng bookingInclude đầy đủ qua findOne().
const bookingCreateInclude = {
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
    },
  },
} as const;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly systemLog: SystemLogService,
    private readonly coupons: CouponsService,
    private readonly promotions: PromotionsService,
  ) { }

  async create(dto: CreateBookingDto, customerId: string, ipAddress?: string, requestId?: string) {
    if (dto.services.length === 0) {
      throw new BadRequestException('Phải chọn ít nhất 1 dịch vụ');
    }

    const [isStoreMember, activePromotion, store, userProfile] = await Promise.all([
      this.prisma.userRole.findFirst({
        where: { userId: customerId, storeId: dto.storeId },
      }),
      this.promotions.findActiveForStore(dto.storeId),
      this.prisma.store.findUnique({ where: { id: dto.storeId } }),
      this.prisma.user.findUnique({
        where: { id: customerId },
        select: { fullName: true, phone: true, email: true },
      }),
    ]);
    if (isStoreMember) {
      throw new ForbiddenException(
        'Bạn là chủ hoặc nhân viên của cơ sở này nên không thể đặt lịch tại đây. Vui lòng sử dụng tài khoản khách hàng khác để đặt lịch.',
      );
    }
    if (!store || store.status !== StoreStatus.ACTIVE) {
      throw new NotFoundException('Cửa hàng không tồn tại hoặc chưa hoạt động');
    }

    const booking = await retryTransaction(() =>
      this.prisma.$transaction(
        async (tx) => {
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

            const variantQuery = tx.serviceVariant.findFirst({
              where: {
                id: svc.variantId,
                serviceId: svc.serviceId,
                status: ServiceStatus.ACTIVE,
                service: { storeId: dto.storeId, status: ServiceStatus.ACTIVE },
              },
              include: { service: { select: { name: true, categoryId: true } } },
            });

            let staffId: string;
            let staffName: string | null;
            let isStaffChosenByCustomer = false;
            let variant: Awaited<typeof variantQuery>;
            if (svc.staffId) {
              // variant và canDo đọc 2 bảng độc lập, không phụ thuộc kết quả nhau;
              // canDo lấy luôn fullName để khỏi phải query staff riêng lần nữa
              const [variantResult, canDo] = await Promise.all([
                variantQuery,
                tx.staff.findFirst({
                  where: { id: svc.staffId, storeId: dto.storeId, status: 'ACTIVE' },
                  include: { user: { select: { fullName: true } } },
                }),
              ]);
              variant = variantResult;
              if (!variant) {
                throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);
              }
              if (!canDo) {
                throw new BadRequestException(`Nhân viên không thực hiện được dịch vụ thứ ${i + 1}`);
              }
              staffId = svc.staffId;
              staffName = canDo.user.fullName;
              isStaffChosenByCustomer = true;
            } else {
              variant = await variantQuery;
              if (!variant) {
                throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);
              }
              const found = await this.pickAvailableStaff(tx, dto.storeId, svc.serviceId, currentTime, variant.duration, store.timezone);
              if (!found) {
                throw new ConflictException(`Không có nhân viên khả dụng cho dịch vụ thứ ${i + 1}`);
              }
              staffId = found.id;
              staffName = found.fullName;
            }

            // Khoá đúng 1 row staff (thay cho Serializable isolation của cả transaction): chỉ
            // booking nhắm CÙNG staff này mới phải xếp hàng chờ nhau, khác staff chạy song song
            // hoàn toàn. Phải khoá TRƯỚC khi findOverlap để đóng đúng race window check-rồi-insert.
            await this.lockStaffForBooking(tx, staffId);
            const overlap = await this.findOverlap(tx, staffId, currentTime, variant.duration);
            if (overlap) throw new ConflictException('Slot này vừa được đặt');

            // Apply promotion per item nếu có và service nằm trong scope
            let itemPrice = variant.price;
            let originalPrice: Prisma.Decimal | null = null;
            if (activePromotion) {
              const categoryId = variant.service.categoryId ?? null;
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
              staffName,
              isStaffChosenByCustomer,
            });

            currentTime = new Date(currentTime.getTime() + variant.duration * 60 * 1000);
          }

          const totalDuration = itemsData.reduce((sum, item) => sum + item.duration, 0);

          // Kiểm tra khách hàng không có lịch hẹn trùng giờ
          const newStart = new Date(dto.scheduledAt);
          const newEnd = new Date(newStart.getTime() + totalDuration * 60 * 1000);
          const windowMin = new Date(newStart.getTime() - OVERLAP_SCAN_MARGIN_MS);
          const customerBookings = await tx.booking.findMany({
            where: {
              customerId,
              status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.DEPOSIT_PENDING, BookingStatus.DEPOSIT_PAID, BookingStatus.PAID] },
              scheduledAt: { gte: windowMin, lte: newEnd },
            },
            select: { scheduledAt: true, totalDuration: true },
          });
          const hasCustomerConflict = customerBookings.some((b) => {
            const bEnd = new Date(b.scheduledAt.getTime() + b.totalDuration * 60 * 1000);
            return newStart < bEnd && b.scheduledAt < newEnd;
          });
          if (hasCustomerConflict) {
            throw new ConflictException('Bạn đã có lịch hẹn trong khoảng thời gian này');
          }

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
          const promotionName = promotionDiscountNum > 0 ? activePromotion!.name : null;

          let couponId: string | null = null;
          let discountAmount = new Prisma.Decimal(0);

          // applyToBooking có ghi (tăng usedCount) nên chỉ chạy sau khi đã chắc chắn không bị
          // conflict lịch ở trên; userProfile đã được đọc ngoài transaction ở đầu hàm rồi
          const couponResult = dto.couponCode
            ? await this.coupons.applyToBooking(tx, dto.couponCode, dto.storeId, totalPrice, customerId)
            : null;
          if (couponResult) {
            couponId = couponResult.couponId;
            discountAmount = couponResult.discountAmount;
          }

          const finalPrice = totalPrice.sub(discountAmount);

          const booking = await tx.booking.create({
            data: {
              customerId,
              customerName: dto.customerName?.trim() || userProfile?.fullName || null,
              customerPhone: dto.customerPhone?.trim() || userProfile?.phone || null,
              customerEmail: dto.customerEmail?.trim() || userProfile?.email || null,
              storeId: dto.storeId,
              scheduledAt: new Date(dto.scheduledAt),
              totalDuration,
              totalPrice,
              promotionDiscount,
              promotionName,
              discountAmount,
              finalPrice,
              couponId,
              promotionId,
              status: store.autoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
              confirmedAt: store.autoConfirm ? new Date() : undefined,
              customerAddress: dto.address,
              customerProvinceId: dto.provinceId,
              customerWardId: dto.wardId,
              notes: dto.notes,
              items: { create: itemsData },
            },
            select: { id: true },
          });

          if (couponId) {
            await this.coupons.recordUsage(tx, couponId, customerId, booking.id, discountAmount);
          }

          return { id: booking.id, itemsData, totalPrice };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      ),
    );

    const scheduledAt = new Date(dto.scheduledAt);
    const serviceNames = booking.itemsData.map((item) => item.serviceName).join(', ');
    this.notifications
      .notifyBookingCreated({
        bookingId: booking.id,
        storeId: dto.storeId,
        storeName: store.name,
        customerId,
        customerName: dto.customerName?.trim() || userProfile?.fullName || undefined,
        customerEmail: dto.customerEmail?.trim() || userProfile?.email || undefined,
        serviceNames,
        scheduledAt,
      })
      .catch(() => undefined);

    this.systemLog.log({ type: LogType.BOOKING_CREATED, actorId: customerId, storeId: dto.storeId, targetId: booking.id, targetType: 'Booking', metadata: { scheduledAt, totalPrice: Number(booking.totalPrice) }, ipAddress, requestId });

    return { id: booking.id };
  }

  async createWalkIn(dto: CreateWalkInBookingDto, storeId: string, actorId: string, ipAddress?: string) {
    if (dto.services.length === 0) {
      throw new BadRequestException('Phải chọn ít nhất 1 dịch vụ');
    }

    // Đọc trước ngoài transaction (xem giải thích ở create()) để rút ngắn thời gian giữ lock
    const [activePromotion, store] = await Promise.all([
      this.promotions.findActiveForStore(storeId),
      this.prisma.store.findUnique({ where: { id: storeId } }),
    ]);
    if (!store || store.status !== StoreStatus.ACTIVE) {
      throw new NotFoundException('Cửa hàng không tồn tại hoặc chưa hoạt động');
    }

    const booking = await retryTransaction(() =>
      this.prisma.$transaction(
        async (tx) => {
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

            const variantQuery = tx.serviceVariant.findFirst({
              where: {
                id: svc.variantId,
                serviceId: svc.serviceId,
                status: ServiceStatus.ACTIVE,
                service: { storeId, status: ServiceStatus.ACTIVE },
              },
              include: { service: { select: { name: true, categoryId: true } } },
            });

            let staffId: string;
            let staffName: string | null;
            let isStaffChosenByCustomer = false;
            let variant: Awaited<typeof variantQuery>;
            if (svc.staffId) {
              const [variantResult, canDo] = await Promise.all([
                variantQuery,
                tx.staff.findFirst({
                  where: { id: svc.staffId, storeId, status: 'ACTIVE' },
                  include: { user: { select: { fullName: true } } },
                }),
              ]);
              variant = variantResult;
              if (!variant) {
                throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);
              }
              if (!canDo) {
                throw new BadRequestException(`Nhân viên không thực hiện được dịch vụ thứ ${i + 1}`);
              }
              staffId = svc.staffId;
              staffName = canDo.user.fullName;
              isStaffChosenByCustomer = true;
            } else {
              variant = await variantQuery;
              if (!variant) {
                throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);
              }
              const found = await this.pickAvailableStaff(tx, storeId, svc.serviceId, currentTime, variant.duration, store.timezone);
              if (!found) {
                throw new ConflictException(`Không có nhân viên khả dụng cho dịch vụ thứ ${i + 1}`);
              }
              staffId = found.id;
              staffName = found.fullName;
            }

            await this.lockStaffForBooking(tx, staffId);
            const overlap = await this.findOverlap(tx, staffId, currentTime, variant.duration);
            if (overlap) throw new ConflictException('Slot này vừa được đặt');

            let itemPrice = variant.price;
            let originalPrice: Prisma.Decimal | null = null;
            if (activePromotion) {
              const categoryId = variant.service.categoryId ?? null;
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
              staffName,
              isStaffChosenByCustomer,
            });

            currentTime = new Date(currentTime.getTime() + variant.duration * 60 * 1000);
          }

          const totalDuration = itemsData.reduce((sum, item) => sum + item.duration, 0);
          const totalPriceNum = itemsData.reduce((sum, item) => sum + Number(item.price), 0);
          const totalPrice = new Prisma.Decimal(totalPriceNum);
          const promotionDiscountNum = itemsData.reduce(
            (sum, item) => sum + (item.originalPrice ? Number(item.originalPrice) - Number(item.price) : 0),
            0,
          );
          const promotionDiscount = new Prisma.Decimal(promotionDiscountNum);
          const promotionId = promotionDiscountNum > 0 ? activePromotion!.id : null;
          const promotionName = promotionDiscountNum > 0 ? activePromotion!.name : null;

          return tx.booking.create({
            data: {
              customerId: null,
              customerName: dto.guestName.trim(),
              customerPhone: dto.guestPhone?.trim() ?? null,
              storeId,
              scheduledAt: new Date(dto.scheduledAt),
              totalDuration,
              totalPrice,
              promotionDiscount,
              promotionName,
              discountAmount: new Prisma.Decimal(0),
              finalPrice: totalPrice.sub(promotionDiscount),
              promotionId,
              status: BookingStatus.CONFIRMED,
              confirmedAt: new Date(),
              notes: dto.notes,
              items: { create: itemsData },
            },
            include: bookingCreateInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      ),
    );

    const serviceNames = booking.items.map((item) => item.service.name).join(', ');
    this.notifications
      .notifyBookingCreated({
        bookingId: booking.id,
        storeId: booking.store.id,
        storeName: booking.store.name,
        customerName: booking.customerName ?? undefined,
        serviceNames,
        scheduledAt: booking.scheduledAt,
      })
      .catch(() => undefined);

    this.systemLog.log({ type: LogType.BOOKING_CREATED, actorId, storeId: booking.storeId, targetId: booking.id, targetType: 'Booking', metadata: { scheduledAt: booking.scheduledAt, totalPrice: Number(booking.totalPrice), walkIn: true }, ipAddress });

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
          ...(filter.to && { lte: new Date(filter.to + 'T23:59:59.999Z') }),
        },
      }),
      ...(filter.search && {
        OR: [
          { id: { contains: filter.search } },
          { store: { name: { contains: filter.search } } },
        ],
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
          ...(filter.to && { lte: new Date(filter.to + 'T23:59:59.999Z') }),
        },
      }),
      ...(filter.search && {
        OR: [
          { customer: { fullName: { contains: filter.search } } },
          { customer: { email: { contains: filter.search } } },
          { customer: { phone: { contains: filter.search } } },
          { customerName: { contains: filter.search } },
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
        orderBy: { createdAt: 'desc' },
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
    if (!booking) throw new NotFoundException('Không tìm thấy lịch đặt');
    return booking;
  }

  async findOneForUser(id: string, userId: string) {
    const booking = await this.findOne(id);
    await this.assertBookingReadable(userId, booking);
    return booking;
  }

  async findOneForStore(id: string, storeId: string) {
    const booking = await this.findOne(id);
    if (booking.storeId !== storeId) throw new NotFoundException('Không tìm thấy lịch đặt');
    return booking;
  }

  async confirm(id: string, userId: string, ipAddress?: string, requestId?: string) {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể xác nhận lịch đặt đang chờ');
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
          customerId: updated.customer?.id,
          customerEmail: updated.customer?.email,
          customerName: updated.customer?.fullName,
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
          customerId: updated.customer?.id,
          customerEmail: updated.customer?.email,
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
      throw new BadRequestException('Chỉ có thể từ chối lịch đặt đang chờ');
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
        customerId: updated.customer?.id,
        customerEmail: updated.customer?.email,
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
    if (booking.status !== BookingStatus.PAID) {
      throw new BadRequestException('Chỉ có thể hoàn thành lịch đặt đã thanh toán đầy đủ');
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
        customerId: updated.customer?.id,
        customerEmail: updated.customer?.email,
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
      throw new BadRequestException('Chỉ có thể hủy lịch đặt đang chờ hoặc đã xác nhận');
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
        customerId: updated.customer?.id,
        customerName: updated.customer?.fullName,
        customerEmail: updated.customer?.email,
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
    booking: { customerId: string | null; storeId: string },
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
  ): Promise<{ id: string; fullName: string | null } | null> {
    const tzOffset = TZ_OFFSETS[timezone] ?? 7 * 60;
    const localDate = new Date(startTime.getTime() + tzOffset * 60 * 1000);
    const dayOfWeek = DOW_MAP[localDate.getUTCDay()];
    const dateStr = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, '0')}-${String(localDate.getUTCDate()).padStart(2, '0')}`;
    const dateUTCMidnight = new Date(`${dateStr}T00:00:00.000Z`);
    const localStartMins = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
    const localEndMins = localStartMins + duration;

    const mappings = await tx.staff.findMany({
      where: { storeId, status: 'ACTIVE' },
      select: { id: true, user: { select: { fullName: true } } },
    });
    if (mappings.length === 0) return null;
    const staffIds = mappings.map((m) => m.id);
    // Lấy sẵn tên staff từ query này luôn, tránh phải query lại staff.findUnique riêng để lấy fullName
    const nameByStaff = new Map(mappings.map((m) => [m.id, m.user.fullName]));

    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    const windowMin = new Date(startTime.getTime() - OVERLAP_SCAN_MARGIN_MS);
    const windowMax = endTime;

    // Batch fetch 1 lần cho toàn bộ staff thay vì query tuần tự từng người
    // (tránh N staff × 4 query round-trip khi khách để hệ thống tự chọn nhân viên)
    const [schedules, callIns, dayOffs, busyItems] = await Promise.all([
      tx.staffSchedule.findMany({ where: { staffId: { in: staffIds }, dayOfWeek, isActive: true } }),
      tx.staffCallIn.findMany({ where: { staffId: { in: staffIds }, date: dateUTCMidnight, status: CallInStatus.ACCEPTED } }),
      tx.staffDayOff.findMany({
        where: { staffId: { in: staffIds }, date: dateUTCMidnight, status: { in: [DayOffStatus.PENDING, DayOffStatus.APPROVED] } },
        select: { staffId: true, startTime: true, endTime: true },
      }),
      tx.bookingItem.findMany({
        where: {
          staffId: { in: staffIds },
          booking: { status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.DEPOSIT_PENDING, BookingStatus.DEPOSIT_PAID, BookingStatus.PAID] } },
          startTime: { gte: windowMin, lte: windowMax },
        },
        select: { staffId: true, startTime: true, duration: true },
      }),
    ]);

    const scheduleByStaff = new Map(schedules.map((s) => [s.staffId, s]));
    const callInByStaff = new Map(callIns.map((c) => [c.staffId, c]));
    const dayOffsByStaff = new Map<string, typeof dayOffs>();
    for (const d of dayOffs) {
      const arr = dayOffsByStaff.get(d.staffId);
      if (arr) arr.push(d); else dayOffsByStaff.set(d.staffId, [d]);
    }
    const busyByStaff = new Map<string, typeof busyItems>();
    for (const item of busyItems) {
      if (!item.staffId) continue;
      const arr = busyByStaff.get(item.staffId);
      if (arr) arr.push(item); else busyByStaff.set(item.staffId, [item]);
    }

    for (const staffId of staffIds) {
      const schedule = scheduleByStaff.get(staffId);
      const callIn = callInByStaff.get(staffId);
      if (!schedule && !callIn) continue;

      const dayOffConflict = (dayOffsByStaff.get(staffId) ?? []).some((d) => {
        if (d.startTime === null) return true;
        const offStart = this.parseTimeMins(d.startTime);
        const offEnd = this.parseTimeMins(d.endTime!);
        return localStartMins < offEnd && offStart < localEndMins;
      });
      if (dayOffConflict) continue;

      const windowStartStr = schedule?.startTime ?? callIn!.startTime;
      const windowEndStr = schedule?.endTime ?? callIn!.endTime;
      if (!windowStartStr || !windowEndStr) continue;
      const windowStart = this.parseTimeMins(windowStartStr);
      const windowEnd = this.parseTimeMins(windowEndStr);
      if (localStartMins < windowStart || localEndMins > windowEnd) continue;

      const overlap = (busyByStaff.get(staffId) ?? []).some((item) => {
        const itemEnd = new Date(item.startTime.getTime() + item.duration * 60 * 1000);
        return startTime < itemEnd && item.startTime < endTime;
      });
      if (!overlap) return { id: staffId, fullName: nameByStaff.get(staffId) ?? null };
    }
    return null;
  }

  private parseTimeMins(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  private async hasDayOffConflict(
    client: Prisma.TransactionClient,
    staffId: string,
    dateUTCMidnight: Date,
    localStartMins: number,
    localEndMins: number,
  ): Promise<boolean> {
    const dayOffs = await client.staffDayOff.findMany({
      where: { staffId, date: dateUTCMidnight, status: { in: [DayOffStatus.PENDING, DayOffStatus.APPROVED] } },
      select: { startTime: true, endTime: true },
    });
    return dayOffs.some((d) => {
      if (d.startTime === null) return true;
      const offStart = this.parseTimeMins(d.startTime);
      const offEnd = this.parseTimeMins(d.endTime!);
      return localStartMins < offEnd && offStart < localEndMins;
    });
  }

  // SELECT ... FOR UPDATE trên đúng 1 row staff. Đây là cơ chế tuần tự hoá thay thế cho
  // Serializable isolation (nay transaction chạy ReadCommitted): 2 booking cùng nhắm 1 staff
  // sẽ xếp hàng ở đây, transaction sau chỉ được tiếp tục sau khi transaction trước commit/rollback
  // -- lúc đó findOverlap (đọc thường, không khoá) mới thấy được item vừa insert vì ReadCommitted
  // luôn đọc dữ liệu mới nhất tại từng câu lệnh (không bị "đóng băng" theo snapshot như
  // RepeatableRead, vốn sẽ khiến việc khoá staff ở đây trở nên vô nghĩa).
  private async lockStaffForBooking(tx: Prisma.TransactionClient, staffId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM staff WHERE id = ${staffId} FOR UPDATE`;
  }

  private async findOverlap(
    tx: Prisma.TransactionClient,
    staffId: string,
    startTime: Date,
    duration: number,
    excludeItemId?: string,
  ) {
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    // item chỉ có thể overlap [startTime, endTime) nếu item.startTime < endTime (bound trên
    // chính xác, không cần nới) và item.startTime + item.duration > startTime (bound dưới cần
    // margin vì chưa biết trước duration của item khác — xem OVERLAP_SCAN_MARGIN_MS)
    const windowMin = new Date(startTime.getTime() - OVERLAP_SCAN_MARGIN_MS);
    const windowMax = endTime;

    const busyItems = await tx.bookingItem.findMany({
      where: {
        staffId,
        ...(excludeItemId && { id: { not: excludeItemId } }),
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

  async findAvailableStaffForSlot(bookingId: string, itemId: string, storeId: string) {
    const booking = await this.findOne(bookingId);
    if (booking.storeId !== storeId) throw new NotFoundException('Không tìm thấy lịch đặt');

    const item = booking.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Không tìm thấy dịch vụ trong lịch hẹn');

    const { startTime, duration } = item;
    const timezone = booking.store.timezone;
    const tzOffset = TZ_OFFSETS[timezone] ?? 7 * 60;
    const localDate = new Date(startTime.getTime() + tzOffset * 60 * 1000);
    const dayOfWeek = DOW_MAP[localDate.getUTCDay()];
    const dateStr = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, '0')}-${String(localDate.getUTCDate()).padStart(2, '0')}`;
    const dateUTCMidnight = new Date(`${dateStr}T00:00:00.000Z`);
    const localStartMins = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
    const localEndMins = localStartMins + duration;

    const staffList = await this.prisma.staff.findMany({
      where: { storeId, status: 'ACTIVE' },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });

    const available: typeof staffList = [];
    for (const staff of staffList) {
      const [schedule, dayOffConflict] = await Promise.all([
        this.prisma.staffSchedule.findFirst({ where: { staffId: staff.id, dayOfWeek, isActive: true } }),
        this.hasDayOffConflict(this.prisma, staff.id, dateUTCMidnight, localStartMins, localEndMins),
      ]);
      if (!schedule || dayOffConflict) continue;

      const scheduleStart = this.parseTimeMins(schedule.startTime);
      const scheduleEnd = this.parseTimeMins(schedule.endTime);
      if (localStartMins < scheduleStart || localEndMins > scheduleEnd) continue;

      // Loại trừ booking item hiện tại để nhân viên đang phụ trách cũng được hiển thị
      const overlap = await this.findOverlap(this.prisma, staff.id, startTime, duration, itemId);
      if (!overlap) available.push(staff);
    }

    return available;
  }

  async updateBookingItemStaff(
    bookingId: string,
    itemId: string,
    newStaffId: string,
    storeId: string,
    userId: string,
    ipAddress?: string,
  ) {
    const booking = await this.findOne(bookingId);
    if (booking.storeId !== storeId) throw new NotFoundException('Không tìm thấy lịch đặt');

    const forbidden: BookingStatus[] = [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REJECTED];
    if (forbidden.includes(booking.status)) {
      throw new BadRequestException('Không thể thay đổi nhân viên cho lịch hẹn đã kết thúc');
    }

    const item = booking.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Không tìm thấy dịch vụ trong lịch hẹn');

    const newStaff = await this.prisma.staff.findFirst({
      where: { id: newStaffId, storeId, status: 'ACTIVE' },
      include: { user: { select: { fullName: true } } },
    });
    if (!newStaff) throw new BadRequestException('Nhân viên không tồn tại hoặc không hoạt động');

    const overlap = await this.findOverlap(this.prisma, newStaffId, item.startTime, item.duration, itemId);
    if (overlap) throw new ConflictException('Nhân viên đã có lịch vào thời điểm này');

    await this.prisma.bookingItem.update({
      where: { id: itemId },
      data: {
        staffId: newStaffId,
        staffName: newStaff.user.fullName,
        isStaffChosenByCustomer: false,
      },
    });

    this.notifications
      .notifyStaffChanged({
        bookingId,
        customerId: booking.customer?.id,
        customerName: booking.customer?.fullName,
        customerEmail: booking.customer?.email,
        storeName: booking.store.name,
        serviceName: item.service.name,
        newStaffName: newStaff.user.fullName,
        scheduledAt: booking.scheduledAt,
      })
      .catch(() => undefined);

    this.systemLog.log({
      type: LogType.BOOKING_STAFF_CHANGED,
      actorId: userId,
      storeId,
      targetId: bookingId,
      targetType: 'Booking',
      metadata: { itemId, newStaffId, newStaffName: newStaff.user.fullName },
      ipAddress,
    });

    return this.findOne(bookingId);
  }
}
