import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService — Phase 4 & 5', () => {
  let service: NotificationsService;
  let prisma: any;

  const userId = 'user-001';
  const storeId = 'store-001';
  const bookingId = 'booking-001';
  const notifId = 'notif-001';
  const ownerId = 'owner-001';

  const baseNotif = {
    id: notifId,
    userId,
    bookingId,
    type: NotificationType.BOOKING_CREATED,
    title: 'Test title',
    body: 'Test body',
    isRead: false,
    createdAt: new Date(),
  };

  let gateway: any;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn().mockResolvedValue(baseNotif),
        findUnique: jest.fn().mockResolvedValue(baseNotif),
        findFirst: jest.fn().mockResolvedValue(baseNotif),
        findMany: jest.fn().mockResolvedValue([baseNotif]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue({ ...baseNotif, isRead: true }),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        delete: jest.fn().mockResolvedValue(baseNotif),
      },
      userRole: {
        findFirst: jest.fn().mockResolvedValue({ userId: ownerId, shopId: storeId }),
      },
    };

    gateway = { emitToUser: jest.fn() };

    service = new NotificationsService(prisma, gateway);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a notification with correct data', async () => {
      const dto = {
        userId,
        bookingId,
        type: NotificationType.BOOKING_CREATED,
        title: 'Test',
        body: 'Body',
      };

      const result = await service.create(dto);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId, type: NotificationType.BOOKING_CREATED }),
        }),
      );
      expect(result.id).toBe(notifId);
    });

    it('defaults isRead to false when not provided', async () => {
      await service.create({ userId, type: NotificationType.PAYMENT_SUCCESS, title: 'T', body: 'B' });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isRead: false }),
        }),
      );
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns items and total', async () => {
      const result = await service.findAll({ userId });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('filters by userId', async () => {
      await service.findAll({ userId });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId }) }),
      );
    });

    it('filters by isRead when provided', async () => {
      await service.findAll({ isRead: false });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isRead: false }) }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns notification when found', async () => {
      const result = await service.findOne(notifId);
      expect(result.id).toBe(notifId);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('marks notification as read', async () => {
      await service.update(notifId, { isRead: true });

      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: notifId },
          data: { isRead: true },
        }),
      );
    });

    it('throws NotFoundException when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { isRead: true })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes notification and returns { deleted: true }', async () => {
      const result = await service.remove(notifId);

      expect(prisma.notification.delete).toHaveBeenCalledWith({ where: { id: notifId } });
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── markAllAsRead ────────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('calls updateMany for all unread notifications of the user', async () => {
      const result = await service.markAllAsRead(userId);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
      expect(result).toEqual({ updated: true });
    });
  });

  // ─── markOneAsRead ────────────────────────────────────────────────────────

  describe('markOneAsRead', () => {
    it('marks a single notification as read', async () => {
      await service.markOneAsRead(notifId, userId);

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: notifId },
        data: { isRead: true },
      });
    });

    it('throws NotFoundException when notification not found for this user', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markOneAsRead('missing', userId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── getUnreadCount ───────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('returns count of unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(userId);

      expect(result).toEqual({ count: 5 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId, isRead: false },
      });
    });
  });

  // ─── Booking lifecycle notifications ──────────────────────────────────────

  describe('notifyBookingCreated', () => {
    const params = {
      bookingId,
      storeId,
      storeName: 'Glowora Spa',
      customerId: userId,
      customerName: 'Test User',
      customerEmail: 'test@test.com',
      serviceNames: 'Massage, Facial',
      scheduledAt: new Date('2026-06-10T09:00:00Z'),
    };

    it('creates notification for store owner when owner exists', async () => {
      await service.notifyBookingCreated(params);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: ownerId,
            type: NotificationType.BOOKING_CREATED,
          }),
        }),
      );
    });

    it('creates notification for customer', async () => {
      await service.notifyBookingCreated(params);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: params.customerId,
            type: NotificationType.BOOKING_CREATED,
          }),
        }),
      );
    });

    it('skips owner notification when owner role not found', async () => {
      prisma.userRole.findFirst.mockResolvedValue(null);

      await service.notifyBookingCreated(params);

      // Only customer notification
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: params.customerId }),
        }),
      );
    });
  });

  describe('notifyBookingConfirmed', () => {
    it('creates confirmed notification for customer', async () => {
      await service.notifyBookingConfirmed({
        bookingId,
        customerId: userId,
        customerEmail: 'test@test.com',
        storeName: 'Glowora',
        serviceNames: 'Massage',
        scheduledAt: new Date(),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            type: NotificationType.BOOKING_CONFIRMED,
          }),
        }),
      );
    });
  });

  describe('notifyBookingRejected', () => {
    it('creates rejected notification for customer with reason', async () => {
      await service.notifyBookingRejected({
        bookingId,
        customerId: userId,
        customerEmail: 'test@test.com',
        storeName: 'Glowora',
        serviceNames: 'Massage',
        reason: 'Hết nhân viên',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            type: NotificationType.BOOKING_REJECTED,
            body: expect.stringContaining('Hết nhân viên'),
          }),
        }),
      );
    });
  });

  describe('notifyBookingCompleted', () => {
    it('creates completed notification prompting customer to review', async () => {
      await service.notifyBookingCompleted({
        bookingId,
        customerId: userId,
        customerEmail: 'test@test.com',
        storeName: 'Glowora',
        serviceNames: 'Massage',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            type: NotificationType.BOOKING_COMPLETED,
          }),
        }),
      );
    });
  });

  describe('notifyPaymentSuccess', () => {
    it('creates payment success notification with formatted amount', async () => {
      await service.notifyPaymentSuccess({
        bookingId,
        customerId: userId,
        customerEmail: 'test@test.com',
        customerName: 'Test User',
        amount: 200000,
        storeName: 'Glowora',
        serviceNames: 'Massage',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            type: NotificationType.PAYMENT_SUCCESS,
            body: expect.stringContaining('200'),
          }),
        }),
      );
    });
  });
});
