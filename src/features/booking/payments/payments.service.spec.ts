import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import * as vnpayUtil from './vnpay.util';

describe('PaymentsService — Phase 5', () => {
  let service: PaymentsService;
  let prisma: any;
  let config: any;
  let notifications: any;

  const bookingId = 'booking-uuid-001';
  const userId = 'user-uuid-001';
  const paymentId = 'pay-uuid-001';
  const txnRef = `${bookingId}-1700000000000`;

  const baseBooking = {
    id: bookingId,
    customerId: userId,
    status: BookingStatus.COMPLETED,
    totalPrice: 500000,
    storeId: 'store-001',
    store: { name: 'Glowora HN' },
    items: [{ service: { name: 'Facial Treatment' } }],
  };

  const basePendingPayment = {
    id: paymentId,
    bookingId,
    customerId: userId,
    amount: 500000,
    status: PaymentStatus.PENDING,
    vnpTxnRef: txnRef,
    customer: { id: userId, fullName: 'Nguyễn A', email: 'a@test.com' },
    booking: {
      store: { name: 'Glowora HN' },
      items: [{ service: { name: 'Facial Treatment' } }],
    },
  };

  beforeEach(() => {
    prisma = {
      booking: { findFirst: jest.fn() },
      payment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    config = {
      get: jest.fn((key: string) => ({
        VNPAY_TMN_CODE: 'TESTCODE',
        VNPAY_HASH_SECRET: 'test-secret',
        VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        VNPAY_RETURN_URL: 'http://localhost:8080/payments/vnpay/return',
        FRONTEND_URL: 'http://localhost:3000',
      }[key] ?? '')),
    };

    notifications = {
      notifyPaymentSuccess: jest.fn().mockResolvedValue(undefined),
    };

    const systemLog = { log: jest.fn() };
    service = new PaymentsService(prisma, config, notifications, systemLog as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createVnpayPayment ───────────────────────────────────────────────────

  describe('createVnpayPayment', () => {
    it('throws NotFoundException when booking does not belong to user', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);

      await expect(
        service.createVnpayPayment(bookingId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when booking status is not COMPLETED', async () => {
      prisma.booking.findFirst.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.CONFIRMED,
      });

      await expect(
        service.createVnpayPayment(bookingId, userId, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when a PAID payment already exists', async () => {
      prisma.booking.findFirst.mockResolvedValue(baseBooking);
      prisma.payment.findFirst.mockResolvedValue({ status: PaymentStatus.PAID });

      await expect(
        service.createVnpayPayment(bookingId, userId, {}),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING VNPAY payment and returns paymentUrl + paymentId', async () => {
      prisma.booking.findFirst.mockResolvedValue(baseBooking);
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue(basePendingPayment);

      const result = await service.createVnpayPayment(bookingId, userId, {});

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingId,
            customerId: userId,
            amount: 500000,
            status: PaymentStatus.PENDING,
            method: PaymentMethod.VNPAY,
          }),
        }),
      );
      expect(result.paymentId).toBe(paymentId);
      expect(result.paymentUrl).toContain('sandbox.vnpayment.vn');
    });
  });

  // ─── handleReturn ─────────────────────────────────────────────────────────

  describe('handleReturn', () => {
    beforeEach(() => {
      jest.spyOn(vnpayUtil, 'verifyVnpaySignature').mockReturnValue(true);
    });

    it('redirects to error=invalid_signature when signature verification fails', async () => {
      jest.spyOn(vnpayUtil, 'verifyVnpaySignature').mockReturnValue(false);

      const url = await service.handleReturn({ vnp_SecureHash: 'bad' });

      expect(url).toContain('error=invalid_signature');
    });

    it('redirects to error=not_found when vnpTxnRef not found in DB', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      const url = await service.handleReturn({ vnp_TxnRef: 'unknown-ref' });

      expect(url).toContain('error=not_found');
    });

    it('returns idempotent redirect when payment is already PAID (no DB update)', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...basePendingPayment,
        status: PaymentStatus.PAID,
      });

      const url = await service.handleReturn({ vnp_TxnRef: txnRef });

      expect(url).toContain('status=PAID');
      expect(url).toContain(`bookingId=${bookingId}`);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('redirects to error=amount_mismatch when amounts differ', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePendingPayment);

      const url = await service.handleReturn({
        vnp_TxnRef: txnRef,
        vnp_Amount: '100000000',
      });

      expect(url).toContain('error=amount_mismatch');
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('updates payment to PAID and redirects success=true on ResponseCode=00', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePendingPayment);
      prisma.payment.update.mockResolvedValue({ ...basePendingPayment, status: PaymentStatus.PAID });

      const url = await service.handleReturn({
        vnp_TxnRef: txnRef,
        vnp_Amount: '50000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: 'VNP12345',
        vnp_BankCode: 'VCB',
      });

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.PAID, paidAt: expect.any(Date) }),
        }),
      );
      expect(url).toContain('success=true');
      expect(url).toContain(`bookingId=${bookingId}`);
    });

    it('updates payment to FAILED and redirects success=false on cancel (ResponseCode=24)', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePendingPayment);
      prisma.payment.update.mockResolvedValue({ ...basePendingPayment, status: PaymentStatus.FAILED });

      const url = await service.handleReturn({
        vnp_TxnRef: txnRef,
        vnp_Amount: '50000000',
        vnp_ResponseCode: '24',
        vnp_TransactionStatus: '24',
      });

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.FAILED }),
        }),
      );
      expect(url).toContain('success=false');
      expect(url).toContain('message=');
    });
  });

  // ─── handleIpn ────────────────────────────────────────────────────────────

  describe('handleIpn', () => {
    beforeEach(() => {
      jest.spyOn(vnpayUtil, 'verifyVnpaySignature').mockReturnValue(true);
    });

    it('returns RspCode 97 when signature is invalid', async () => {
      jest.spyOn(vnpayUtil, 'verifyVnpaySignature').mockReturnValue(false);

      const result = await service.handleIpn({});

      expect(result).toEqual({ RspCode: '97', Message: 'Invalid Checksum' });
    });

    it('returns RspCode 01 when payment not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      const result = await service.handleIpn({ vnp_TxnRef: 'unknown' });

      expect(result).toEqual({ RspCode: '01', Message: 'Order not found' });
    });

    it('returns RspCode 04 when amount does not match', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePendingPayment);

      const result = await service.handleIpn({
        vnp_TxnRef: txnRef,
        vnp_Amount: '100',
      });

      expect(result).toEqual({ RspCode: '04', Message: 'Invalid Amount' });
    });

    it('returns RspCode 02 and skips DB update when already PAID (idempotent)', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...basePendingPayment,
        status: PaymentStatus.PAID,
      });

      const result = await service.handleIpn({
        vnp_TxnRef: txnRef,
        vnp_Amount: '50000000',
      });

      expect(result).toEqual({ RspCode: '02', Message: 'Order already confirmed' });
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('returns RspCode 02 when already FAILED', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...basePendingPayment,
        status: PaymentStatus.FAILED,
      });

      const result = await service.handleIpn({ vnp_TxnRef: txnRef, vnp_Amount: '50000000' });

      expect(result).toEqual({ RspCode: '02', Message: 'Order already confirmed' });
    });

    it('updates to PAID, fires notification, returns RspCode 00 on success', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePendingPayment);
      prisma.payment.update.mockResolvedValue({ ...basePendingPayment, status: PaymentStatus.PAID });

      const result = await service.handleIpn({
        vnp_TxnRef: txnRef,
        vnp_Amount: '50000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: 'VNP999',
        vnp_BankCode: 'VCB',
      });

      expect(result).toEqual({ RspCode: '00', Message: 'Confirm Success' });
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.PAID }),
        }),
      );
      await Promise.resolve();
      expect(notifications.notifyPaymentSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: userId }),
      );
    });

    it('updates to FAILED and does NOT fire notification on cancel (code 24)', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePendingPayment);
      prisma.payment.update.mockResolvedValue({ ...basePendingPayment, status: PaymentStatus.FAILED });

      const result = await service.handleIpn({
        vnp_TxnRef: txnRef,
        vnp_Amount: '50000000',
        vnp_ResponseCode: '24',
        vnp_TransactionStatus: '24',
      });

      expect(result).toEqual({ RspCode: '00', Message: 'Confirm Success' });
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.FAILED }),
        }),
      );
      await Promise.resolve();
      expect(notifications.notifyPaymentSuccess).not.toHaveBeenCalled();
    });
  });

  // ─── findMyPayments ───────────────────────────────────────────────────────

  it('findMyPayments queries by customerId ordered by createdAt desc', async () => {
    prisma.payment.findMany.mockResolvedValue([basePendingPayment]);

    const result = await service.findMyPayments(userId);

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result).toHaveLength(1);
  });

  // ─── findPaymentByBooking ─────────────────────────────────────────────────

  it('findPaymentByBooking scopes to userId when provided', async () => {
    prisma.payment.findMany.mockResolvedValue([]);

    await service.findPaymentByBooking(bookingId, userId);

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId, customerId: userId },
      }),
    );
  });

  it('findPaymentByBooking omits customerId filter when not provided', async () => {
    prisma.payment.findMany.mockResolvedValue([]);

    await service.findPaymentByBooking(bookingId);

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId },
      }),
    );
  });
});
