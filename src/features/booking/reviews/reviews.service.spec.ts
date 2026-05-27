import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { ReviewsService } from './reviews.service';

describe('ReviewsService — Phase 5', () => {
  let service: ReviewsService;
  let prisma: any;
  let tx: any;

  const storeId = 'store-001';
  const serviceId = 'svc-001';
  const staffId = 'staff-001';
  const customerId = 'user-001';
  const bookingId = 'booking-001';
  const bookingItemId = 'item-001';
  const reviewId = 'rev-001';

  const baseBookingItem = {
    id: bookingItemId,
    bookingId,
    serviceId,
    staffId,
    booking: {
      id: bookingId,
      customerId,
      storeId,
      status: BookingStatus.COMPLETED,
    },
  };

  const baseReview = {
    id: reviewId,
    bookingItemId,
    bookingId,
    customerId,
    storeId,
    serviceId,
    staffId,
    rating: 5,
    comment: 'Tuyệt vời!',
    isVisible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const agg = (avg: number, count: number) => ({
    _avg: { rating: avg },
    _count: { rating: count },
  });

  beforeEach(() => {
    tx = {
      review: {
        create: jest.fn().mockResolvedValue(baseReview),
        update: jest.fn().mockResolvedValue(baseReview),
        aggregate: jest.fn().mockResolvedValue(agg(4.5, 10)),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      store: { update: jest.fn() },
      service: { update: jest.fn() },
      staff: { update: jest.fn() },
    };

    prisma = {
      bookingItem: { findUnique: jest.fn() },
      review: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      store: { update: jest.fn() },
      service: { update: jest.fn() },
      staff: { update: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    service = new ReviewsService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    beforeEach(() => {
      prisma.bookingItem.findUnique.mockResolvedValue(baseBookingItem);
      prisma.review.findUnique.mockResolvedValue(null);
    });

    it('throws BadRequestException when no bookingItemId in dto and no override', async () => {
      await expect(
        service.create({ rating: 5 }, customerId, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts bookingItemId from URL override', async () => {
      await expect(
        service.create({ rating: 5 }, customerId, bookingItemId),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundException when bookingItem not found', async () => {
      prisma.bookingItem.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ rating: 5 }, customerId, bookingItemId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when booking belongs to another customer', async () => {
      await expect(
        service.create({ rating: 5 }, 'other-user-id', bookingItemId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when booking status is not COMPLETED', async () => {
      prisma.bookingItem.findUnique.mockResolvedValue({
        ...baseBookingItem,
        booking: { ...baseBookingItem.booking, status: BookingStatus.PENDING },
      });

      await expect(
        service.create({ rating: 5 }, customerId, bookingItemId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when bookingItem is already reviewed', async () => {
      prisma.review.findUnique.mockResolvedValue(baseReview);

      await expect(
        service.create({ rating: 5 }, customerId, bookingItemId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates review in a transaction with correct data', async () => {
      await service.create({ rating: 5, comment: 'Tuyệt vời!' }, customerId, bookingItemId);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tx.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingItemId,
            bookingId,
            customerId,
            storeId,
            serviceId,
            staffId,
            rating: 5,
            comment: 'Tuyệt vời!',
          }),
        }),
      );
    });

    it('recalculates ratings for store, service, and staff after create', async () => {
      await service.create({ rating: 5 }, customerId, bookingItemId);

      expect(tx.store.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: storeId } }),
      );
      expect(tx.service.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: serviceId } }),
      );
      expect(tx.staff.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: staffId } }),
      );
    });

    it('skips staff rating update when bookingItem has no staffId', async () => {
      prisma.bookingItem.findUnique.mockResolvedValue({
        ...baseBookingItem,
        staffId: null,
      });

      await service.create({ rating: 4 }, customerId, bookingItemId);

      expect(tx.staff.update).not.toHaveBeenCalled();
    });
  });

  // ─── findByStore ──────────────────────────────────────────────────────────

  describe('findByStore', () => {
    beforeEach(() => {
      prisma.review.findMany.mockResolvedValue([baseReview]);
      prisma.review.count.mockResolvedValue(1);
      prisma.review.groupBy.mockResolvedValue([
        { rating: 5, _count: { rating: 1 } },
      ]);
    });

    it('returns items, total, page, limit and breakdown map', async () => {
      const result = await service.findByStore(storeId, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.breakdown).toMatchObject({ 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 });
    });

    it('filters only visible reviews', async () => {
      await service.findByStore(storeId, {});

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isVisible: true }) }),
      );
    });

    it('applies rating filter when provided', async () => {
      await service.findByStore(storeId, { rating: 5 });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ rating: 5 }) }),
      );
    });

    it('uses default page=1 and limit=10 when not provided', async () => {
      const result = await service.findByStore(storeId, {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('calculates correct skip for page 2', async () => {
      await service.findByStore(storeId, { page: 2, limit: 5 });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  // ─── findByService ────────────────────────────────────────────────────────

  describe('findByService', () => {
    beforeEach(() => {
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);
    });

    it('filters by serviceId and isVisible', async () => {
      await service.findByService(serviceId, {});

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceId, isVisible: true },
        }),
      );
    });
  });

  // ─── findByBookingItem ────────────────────────────────────────────────────

  it('findByBookingItem returns review by bookingItemId', async () => {
    prisma.review.findUnique.mockResolvedValue(baseReview);

    const result = await service.findByBookingItem(bookingItemId);

    expect(prisma.review.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingItemId } }),
    );
    expect(result?.id).toBe(reviewId);
  });

  it('findByBookingItem returns null when no review exists', async () => {
    prisma.review.findUnique.mockResolvedValue(null);

    const result = await service.findByBookingItem('no-review-item');

    expect(result).toBeNull();
  });

  // ─── toggleVisibility ─────────────────────────────────────────────────────

  describe('toggleVisibility', () => {
    beforeEach(() => {
      prisma.review.findUnique.mockResolvedValue(baseReview);
    });

    it('sets isVisible=false in transaction', async () => {
      await service.toggleVisibility(reviewId, false);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tx.review.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: reviewId },
          data: { isVisible: false },
        }),
      );
    });

    it('recalculates store and service ratings after toggle', async () => {
      await service.toggleVisibility(reviewId, false);

      expect(tx.store.update).toHaveBeenCalled();
      expect(tx.service.update).toHaveBeenCalled();
    });

    it('throws NotFoundException when review not found', async () => {
      prisma.review.findUnique.mockResolvedValue(null);

      await expect(service.toggleVisibility('missing-id', false)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    beforeEach(() => {
      prisma.review.findUnique.mockResolvedValue(baseReview);
      prisma.review.delete.mockResolvedValue(baseReview);
      prisma.review.aggregate.mockResolvedValue(agg(0, 0));
    });

    it('deletes review and returns { deleted: true }', async () => {
      const result = await service.remove(reviewId);

      expect(prisma.review.delete).toHaveBeenCalledWith({ where: { id: reviewId } });
      expect(result).toEqual({ deleted: true });
    });

    it('recalculates ratings after deletion', async () => {
      await service.remove(reviewId);

      expect(prisma.store.update).toHaveBeenCalled();
      expect(prisma.service.update).toHaveBeenCalled();
    });

    it('throws NotFoundException when review not found', async () => {
      prisma.review.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.review.delete).not.toHaveBeenCalled();
    });
  });
});
