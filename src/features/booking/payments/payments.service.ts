import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications/notifications.service';
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
    private readonly notifications: NotificationsService,
  ) {}

  async createSepayPayment(bookingId: string, userId: string, chosenType?: PaymentType) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId: userId },
      include: {
        store: { include: { paymentConfig: true } },
        items: { include: { service: true } },
      },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy lịch đặt');

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

  async handleSepayWebhook(payload: SepayWebhookDto, authHeader: string | undefined, storeId: string) {
    const config = await this.prisma.storePaymentConfig.findUnique({
      where: { storeId },
      select: { webhookSecret: true },
    });
    if (!config?.webhookSecret || !verifySepayWebhook(authHeader, config.webhookSecret)) {
      return { success: false, message: 'Không có quyền truy cập' };
    }

    if (payload.transferType !== 'in') {
      return { success: true, message: 'Bỏ qua giao dịch không hợp lệ' };
    }

    const rawContent = payload.code ?? payload.content ?? '';
    const sepayCode = extractSepayCode(rawContent);
    if (!sepayCode) {
      return { success: true, message: 'Không tìm thấy mã giao dịch trong nội dung' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { sepayCode, status: PaymentStatus.PENDING },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        booking: { include: { store: true, items: { include: { service: true } } } },
      },
    });

    if (!payment) {
      return { success: true, message: 'Không tìm thấy thanh toán hoặc đã được xử lý' };
    }

    if (payload.transferAmount < Number(payment.amount)) {
      // updateMany + where status:PENDING để thao tác nguyên tử — tránh 2 lần gọi webhook
      // trùng nhau (SePay retry) cùng đọc thấy PENDING rồi cùng ghi FAILED, gây log trùng.
      const { count } = await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.FAILED,
          failedReason: `Số tiền không đủ: nhận ${payload.transferAmount}, cần ${Number(payment.amount)}`,
        },
      });
      if (count === 0) {
        return { success: true, message: 'Không tìm thấy thanh toán hoặc đã được xử lý' };
      }
      return { success: false, message: 'Số tiền thanh toán không đủ' };
    }

    const updated = await this.updatePaymentSuccess(payment.id, payment.type, payment.bookingId, {
      transactionId: String(payload.id),
      gateway: payload.gateway,
    });
    if (!updated) {
      return { success: true, message: 'Không tìm thấy thanh toán hoặc đã được xử lý' };
    }

    const serviceNames = payment.booking.items.map((i) => i.service?.name ?? i.serviceName).join(', ');

    if (payment.type === PaymentType.DEPOSIT) {
      this.notifications
        .notifyDepositPaid({
          bookingId: payment.bookingId,
          storeId: payment.booking.storeId,
          storeName: payment.booking.store.name,
          customerId: payment.customer?.id,
          customerName: payment.customer?.fullName,
          customerEmail: payment.customer?.email,
          serviceNames,
          depositAmount: Number(payment.amount),
        })
        .catch(() => {});
    } else {
      this.notifications
        .notifyPaymentSuccess({
          bookingId: payment.bookingId,
          customerId: payment.customer?.id,
          customerEmail: payment.customer?.email,
          customerName: payment.customer?.fullName,
          amount: Number(payment.amount),
          storeName: payment.booking.store.name,
          serviceNames,
        })
        .catch(() => {});
    }

    return { success: true, message: 'Thanh toán đã được xác nhận' };
  }

  async recordStorePayment(
    bookingId: string,
    storeId: string,
    staffId: string,
    method: PaymentMethod,
    chosenType?: PaymentType,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, storeId },
      include: {
        store: { include: { paymentConfig: true } },
        items: { include: { service: true } },
      },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy lịch đặt');

    const payableStatuses: BookingStatus[] = [
      BookingStatus.CONFIRMED,
      BookingStatus.DEPOSIT_PENDING,
      BookingStatus.DEPOSIT_PAID,
    ];
    if (!payableStatuses.includes(booking.status)) {
      throw new BadRequestException('Lịch hẹn không ở trạng thái có thể thanh toán');
    }

    if (method === PaymentMethod.SEPAY && !booking.store.paymentConfig?.isActive) {
      throw new BadRequestException('Cửa hàng chưa cấu hình thanh toán chuyển khoản');
    }

    // Tính số tiền — logic giống createSepayPayment
    const isDepositPending = booking.status === BookingStatus.DEPOSIT_PENDING;
    let chargeAmount: Prisma.Decimal;
    let paymentType: PaymentType;

    if (isDepositPending) {
      const actualType = chosenType ?? PaymentType.FULL;

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

    if (method === PaymentMethod.CASH) {
      return this.recordCashPayment(bookingId, storeId, staffId, chargeAmount, paymentType, booking.customerId);
    }

    return this.createTransferQr(bookingId, storeId, chargeAmount, paymentType, booking.customerId, booking.store.paymentConfig!);
  }

  private async recordCashPayment(
    bookingId: string,
    storeId: string,
    staffId: string,
    amount: Prisma.Decimal,
    paymentType: PaymentType,
    customerId: string | null,
  ) {
    const now = new Date();
    const paymentCreate = this.prisma.payment.create({
      data: {
        bookingId,
        customerId,
        amount,
        type: paymentType,
        status: PaymentStatus.PAID,
        method: PaymentMethod.CASH,
        paidAt: now,
      },
    });

    if (paymentType === PaymentType.DEPOSIT) {
      await this.prisma.$transaction([
        paymentCreate,
        this.prisma.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.DEPOSIT_PAID, depositPaidAt: now },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        paymentCreate,
        this.prisma.booking.updateMany({
          where: {
            id: bookingId,
            status: {
              in: [
                BookingStatus.CONFIRMED,
                BookingStatus.DEPOSIT_PENDING,
                BookingStatus.DEPOSIT_PAID,
              ],
            },
          },
          data: { status: BookingStatus.PAID },
        }),
      ]);
    }

    return { recorded: true, amount: Number(amount), paymentType };
  }

  private async createTransferQr(
    bookingId: string,
    storeId: string,
    amount: Prisma.Decimal,
    paymentType: PaymentType,
    customerId: string | null,
    paymentConfig: { bankBin: string; bankAccountNo: string; bankAccountName: string },
  ) {
    await this.prisma.payment.updateMany({
      where: { bookingId, type: paymentType, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED, failedReason: 'Thay thế bởi lần thanh toán mới' },
    });

    const sepayCode = generateSepayCode();
    const payment = await this.prisma.payment.create({
      data: {
        bookingId,
        customerId,
        amount,
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
      amount: Number(amount),
      content: sepayCode,
    });

    return {
      paymentId: payment.id,
      sepayCode,
      amount: Number(amount),
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
    if (!payment) throw new NotFoundException('Không tìm thấy thông tin thanh toán');
    return payment;
  }

  // Trả về false nếu payment không còn ở PENDING lúc này (đã được 1 lần gọi webhook khác
  // xử lý trước đó — vd SePay gửi trùng webhook do retry) -> caller không gửi notification trùng.
  private async updatePaymentSuccess(
    paymentId: string,
    type: PaymentType,
    bookingId: string,
    sepayData: { transactionId: string; gateway: string },
  ): Promise<boolean> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // updateMany + where status:PENDING trong cùng transaction: nếu 2 request xử lý
      // cùng payment chạy đồng thời, request thứ 2 sẽ bị block tới khi request đầu commit,
      // rồi đọc lại thấy status đã là PAID -> count = 0 -> không cập nhật booking/gửi thông báo lần 2.
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.PAID,
          sepayTransactionId: sepayData.transactionId,
          sepayGateway: sepayData.gateway,
          paidAt: now,
        },
      });
      if (count === 0) return false;

      if (type === PaymentType.DEPOSIT) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.DEPOSIT_PAID, depositPaidAt: now },
        });
      } else {
        await tx.booking.updateMany({
          where: {
            id: bookingId,
            status: {
              in: [
                BookingStatus.CONFIRMED,
                BookingStatus.DEPOSIT_PENDING,
                BookingStatus.DEPOSIT_PAID,
              ],
            },
          },
          data: { status: BookingStatus.PAID },
        });
      }
      return true;
    });
  }
}
