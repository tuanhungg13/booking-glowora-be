import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  LogType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications/notifications.service';
import { SystemLogService } from '../../../system-log/system-log.service';
import {
  buildVietQrUrl,
  extractSepayCode,
  generateSepayCode,
  verifySepayWebhook,
} from './sepay.util';
import { SepayWebhookDto } from './dto/sepay-webhook.dto';

const paymentInclude = {
  booking: {
    include: {
      store: true,
      items: { include: { service: true } },
    },
  },
  customer: { select: { id: true, fullName: true, email: true } },
} as const;

const PAYMENT_EXPIRY_MS = 15 * 60 * 1000; // 15 phút

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly systemLog: SystemLogService,
  ) {}

  async createSepayPayment(bookingId: string, userId: string, chosenType?: PaymentType) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId: userId },
      include: {
        store: { include: { paymentConfig: true } },
        items: { include: { service: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const paymentConfig = booking.store.paymentConfig;
    if (!paymentConfig || !paymentConfig.isActive) {
      throw new BadRequestException('Cửa hàng chưa cấu hình thanh toán chuyển khoản');
    }

    const isDepositPending = booking.status === BookingStatus.DEPOSIT_PENDING;
    const isPayable =
      isDepositPending ||
      booking.status === BookingStatus.CONFIRMED ||
      booking.status === BookingStatus.DEPOSIT_PAID;
    if (!isPayable) {
      throw new BadRequestException('Chỉ thanh toán sau khi lịch hẹn được xác nhận');
    }

    let chargeAmount: Prisma.Decimal;
    let paymentType: PaymentType;

    if (isDepositPending) {
      const actualType = chosenType ?? PaymentType.DEPOSIT;

      if (actualType === PaymentType.DEPOSIT) {
        const paidDeposit = await this.prisma.payment.findFirst({
          where: { bookingId, type: PaymentType.DEPOSIT, status: PaymentStatus.PAID },
        });
        if (paidDeposit) throw new BadRequestException('Tiền cọc đã được thanh toán');
        chargeAmount = booking.depositAmount!;
        paymentType = PaymentType.DEPOSIT;
      } else {
        const paidFull = await this.prisma.payment.findFirst({
          where: { bookingId, type: PaymentType.FULL, status: PaymentStatus.PAID },
        });
        if (paidFull) throw new BadRequestException('Booking này đã được thanh toán đầy đủ');
        const total =
          Number(booking.finalPrice) > 0 ? Number(booking.finalPrice) : Number(booking.totalPrice);
        chargeAmount = new Prisma.Decimal(total);
        paymentType = PaymentType.FULL;
      }
    } else {
      const paidFull = await this.prisma.payment.findFirst({
        where: { bookingId, type: PaymentType.FULL, status: PaymentStatus.PAID },
      });
      if (paidFull) throw new BadRequestException('Booking này đã được thanh toán');
      const total =
        Number(booking.finalPrice) > 0 ? Number(booking.finalPrice) : Number(booking.totalPrice);
      const depositPaid =
        booking.status === BookingStatus.DEPOSIT_PAID && booking.depositAmount
          ? Number(booking.depositAmount)
          : 0;
      const remaining = total - depositPaid;
      if (remaining <= 0) throw new BadRequestException('Không còn số tiền cần thanh toán');
      chargeAmount = new Prisma.Decimal(remaining);
      paymentType = PaymentType.FULL;
    }

    // Hủy các lệnh thanh toán PENDING cũ cùng loại
    await this.prisma.payment.updateMany({
      where: { bookingId, type: paymentType, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED, failedReason: 'Thay thế bởi lần thanh toán mới' },
    });

    const sepayCode = generateSepayCode();
    const payment = await this.prisma.payment.create({
      data: {
        bookingId,
        customerId: userId,
        amount: chargeAmount,
        type: paymentType,
        status: PaymentStatus.PENDING,
        method: PaymentMethod.SEPAY,
        sepayCode,
      },
    });

    const expiredAt = new Date(Date.now() + PAYMENT_EXPIRY_MS);
    const qrUrl = buildVietQrUrl({
      bankBin: paymentConfig.bankBin,
      accountNo: paymentConfig.bankAccountNo,
      accountName: paymentConfig.bankAccountName,
      amount: Number(chargeAmount),
      content: sepayCode,
    });

    return {
      paymentId: payment.id,
      sepayCode,
      amount: Number(chargeAmount),
      content: sepayCode,
      bankInfo: {
        bankBin: paymentConfig.bankBin,
        accountNo: paymentConfig.bankAccountNo,
        accountName: paymentConfig.bankAccountName,
      },
      qrUrl,
      expiredAt,
    };
  }

  async handleSepayWebhook(payload: SepayWebhookDto, authHeader: string | undefined) {
    const secret = this.config.get<string>('SEPAY_WEBHOOK_SECRET') ?? '';
    if (!verifySepayWebhook(authHeader, secret)) {
      return { success: false, message: 'Unauthorized' };
    }

    if (payload.transferType !== 'in') {
      return { success: true, message: 'Skipped non-incoming transfer' };
    }

    const rawContent = payload.code ?? payload.content ?? '';
    const sepayCode = extractSepayCode(rawContent);
    if (!sepayCode) {
      return { success: true, message: 'No sepayCode in content' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { sepayCode, status: PaymentStatus.PENDING },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        booking: { include: { store: true, items: { include: { service: true } } } },
      },
    });

    if (!payment) {
      return { success: true, message: 'Payment not found or already processed' };
    }

    if (payload.transferAmount < Number(payment.amount)) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failedReason: `Số tiền không đủ: nhận ${payload.transferAmount}, cần ${Number(payment.amount)}`,
        },
      });
      this.systemLog.log({
        type: LogType.PAYMENT_FAILED,
        actorId: payment.customer.id,
        storeId: payment.booking.storeId,
        targetId: payment.id,
        targetType: 'Payment',
        metadata: {
          bookingId: payment.bookingId,
          transferAmount: payload.transferAmount,
          requiredAmount: Number(payment.amount),
        },
      });
      return { success: false, message: 'Insufficient amount' };
    }

    await this.updatePaymentSuccess(payment.id, payment.type, payment.bookingId, {
      transactionId: String(payload.id),
      gateway: payload.gateway,
    });

    const serviceNames = payment.booking.items.map((i) => i.service.name).join(', ');

    if (payment.type === PaymentType.DEPOSIT) {
      this.systemLog.log({
        type: LogType.BOOKING_DEPOSIT_PAID,
        actorId: payment.customer.id,
        storeId: payment.booking.storeId,
        targetId: payment.id,
        targetType: 'Payment',
        metadata: { bookingId: payment.bookingId, amount: Number(payment.amount) },
      });
      this.notifications
        .notifyDepositPaid({
          bookingId: payment.bookingId,
          storeId: payment.booking.storeId,
          storeName: payment.booking.store.name,
          customerId: payment.customer.id,
          customerName: payment.customer.fullName,
          customerEmail: payment.customer.email,
          serviceNames,
          depositAmount: Number(payment.amount),
        })
        .catch(() => {});
    } else {
      this.systemLog.log({
        type: LogType.PAYMENT_COMPLETED,
        actorId: payment.customer.id,
        storeId: payment.booking.storeId,
        targetId: payment.id,
        targetType: 'Payment',
        metadata: { bookingId: payment.bookingId, amount: Number(payment.amount) },
      });
      this.notifications
        .notifyPaymentSuccess({
          bookingId: payment.bookingId,
          customerId: payment.customer.id,
          customerEmail: payment.customer.email,
          customerName: payment.customer.fullName,
          amount: Number(payment.amount),
          storeName: payment.booking.store.name,
          serviceNames,
        })
        .catch(() => {});
    }

    return { success: true, message: 'Payment confirmed' };
  }

  async findMyPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: 'desc' },
      include: paymentInclude,
    });
  }

  async findPaymentByBooking(bookingId: string, userId?: string) {
    return this.prisma.payment.findMany({
      where: {
        bookingId,
        ...(userId ? { customerId: userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: paymentInclude,
    });
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  private async updatePaymentSuccess(
    paymentId: string,
    type: PaymentType,
    bookingId: string,
    sepayData: { transactionId: string; gateway: string },
  ) {
    const now = new Date();
    const paymentUpdate = this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        sepayTransactionId: sepayData.transactionId,
        sepayGateway: sepayData.gateway,
        paidAt: now,
      },
    });

    if (type === PaymentType.DEPOSIT) {
      await this.prisma.$transaction([
        paymentUpdate,
        this.prisma.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.DEPOSIT_PAID, depositPaidAt: now },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        paymentUpdate,
        this.prisma.booking.updateMany({
          where: { id: bookingId, status: BookingStatus.DEPOSIT_PENDING },
          data: { status: BookingStatus.CONFIRMED },
        }),
      ]);
    }
  }
}
