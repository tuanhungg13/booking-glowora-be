import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications/notifications.service';
import { SystemLogService } from '../../../system-log/system-log.service';
import { LogType } from '@prisma/client';
import {
  buildVnpayUrl,
  getClientIp,
  mapVnpayErrorCode,
  verifyVnpaySignature,
} from './vnpay.util';

const paymentInclude = {
  booking: {
    include: {
      store: true,
      items: { include: { service: true } },
    },
  },
  customer: { select: { id: true, fullName: true, email: true } },
} as const;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly systemLog: SystemLogService,
  ) {}

  async createVnpayPayment(bookingId: string, userId: string, req: unknown) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId: userId },
      include: { store: true, items: { include: { service: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Chỉ thanh toán sau khi lịch hẹn được xác nhận');
    }

    const paidPayment = await this.prisma.payment.findFirst({
      where: { bookingId, status: PaymentStatus.PAID },
    });
    if (paidPayment) {
      throw new BadRequestException('Booking này đã được thanh toán');
    }

    const txnRef = `${bookingId}-${Date.now()}`;
    const payment = await this.prisma.payment.create({
      data: {
        bookingId,
        customerId: userId,
        amount: booking.totalPrice,
        status: PaymentStatus.PENDING,
        method: PaymentMethod.VNPAY,
        vnpTxnRef: txnRef,
      },
    });

    const serviceNames = booking.items.map((i) => i.service.name).join(', ');
    const paymentUrl = buildVnpayUrl(
      {
        amount: Number(booking.totalPrice),
        orderInfo: `Thanh toan ${serviceNames} tai ${booking.store.name}`,
        txnRef,
        clientIp: getClientIp(req as Record<string, unknown>),
        returnUrl: this.config.get<string>('VNPAY_RETURN_URL') ?? '',
      },
      {
        tmnCode: this.config.get<string>('VNPAY_TMN_CODE') ?? '',
        hashSecret: this.config.get<string>('VNPAY_HASH_SECRET') ?? '',
        paymentUrl: this.config.get<string>('VNPAY_URL') ?? '',
      },
    );

    return { paymentUrl, paymentId: payment.id };
  }

  async handleReturn(vnpParams: Record<string, string>): Promise<string> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const hashSecret = this.config.get<string>('VNPAY_HASH_SECRET') ?? '';

    if (!verifyVnpaySignature(vnpParams, hashSecret)) {
      return `${frontendUrl}/payment/result?error=invalid_signature`;
    }

    const payment = await this.prisma.payment.findFirst({
      where: { vnpTxnRef: vnpParams['vnp_TxnRef'] },
    });
    if (!payment) {
      return `${frontendUrl}/payment/result?error=not_found`;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      return `${frontendUrl}/payment/result?status=${payment.status}&bookingId=${payment.bookingId}`;
    }

    const vnpAmount = parseInt(vnpParams['vnp_Amount'] ?? '0') / 100;
    if (Math.abs(vnpAmount - Number(payment.amount)) > 0.01) {
      return `${frontendUrl}/payment/result?error=amount_mismatch`;
    }

    if (vnpParams['vnp_ResponseCode'] === '00' && vnpParams['vnp_TransactionStatus'] === '00') {
      await this.updatePaymentSuccess(payment.id, vnpParams);
      return `${frontendUrl}/payment/result?success=true&bookingId=${payment.bookingId}`;
    }

    await this.updatePaymentFailed(payment.id, vnpParams);
    const message = mapVnpayErrorCode(vnpParams['vnp_ResponseCode'] ?? '');
    return `${frontendUrl}/payment/result?success=false&message=${encodeURIComponent(message)}&bookingId=${payment.bookingId}`;
  }

  async handleIpn(vnpParams: Record<string, string>): Promise<{ RspCode: string; Message: string }> {
    const hashSecret = this.config.get<string>('VNPAY_HASH_SECRET') ?? '';

    if (!verifyVnpaySignature(vnpParams, hashSecret)) {
      return { RspCode: '97', Message: 'Invalid Checksum' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { vnpTxnRef: vnpParams['vnp_TxnRef'] },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        booking: { include: { store: true, items: { include: { service: true } } } },
      },
    });
    if (!payment) return { RspCode: '01', Message: 'Order not found' };

    const vnpAmount = parseInt(vnpParams['vnp_Amount'] ?? '0') / 100;
    if (Math.abs(vnpAmount - Number(payment.amount)) > 0.01) {
      return { RspCode: '04', Message: 'Invalid Amount' };
    }

    if (payment.status !== PaymentStatus.PENDING) {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    if (vnpParams['vnp_ResponseCode'] === '00' && vnpParams['vnp_TransactionStatus'] === '00') {
      await this.updatePaymentSuccess(payment.id, vnpParams);
      this.systemLog.log({ type: LogType.PAYMENT_COMPLETED, actorId: payment.customer.id, targetId: payment.id, targetType: 'Payment', metadata: { bookingId: payment.bookingId, amount: Number(payment.amount) } });
      const serviceNames = payment.booking.items.map((i) => i.service.name).join(', ');
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
    } else {
      await this.updatePaymentFailed(payment.id, vnpParams);
      this.systemLog.log({ type: LogType.PAYMENT_FAILED, actorId: payment.customer.id, targetId: payment.id, targetType: 'Payment', metadata: { bookingId: payment.bookingId, responseCode: vnpParams['vnp_ResponseCode'] } });
    }

    return { RspCode: '00', Message: 'Confirm Success' };
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

  private async updatePaymentSuccess(paymentId: string, vnpParams: Record<string, string>) {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        vnpTransactionNo: vnpParams['vnp_TransactionNo'],
        vnpBankCode: vnpParams['vnp_BankCode'],
        vnpCardType: vnpParams['vnp_CardType'],
        vnpPayDate: vnpParams['vnp_PayDate'],
        vnpResponseCode: vnpParams['vnp_ResponseCode'],
        paidAt: new Date(),
      },
    });
  }

  private async updatePaymentFailed(paymentId: string, vnpParams: Record<string, string>) {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.FAILED,
        vnpResponseCode: vnpParams['vnp_ResponseCode'],
        failedReason: mapVnpayErrorCode(vnpParams['vnp_ResponseCode'] ?? ''),
      },
    });
  }
}
