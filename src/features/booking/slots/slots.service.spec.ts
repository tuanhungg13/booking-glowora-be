import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SlotsService } from './slots.service';

describe('SlotsService — Phase 4', () => {
  let service: SlotsService;
  let prisma: any;

  const storeId = 'store-001';
  const serviceId = 'svc-001';
  const variantId = 'var-001';
  const staffId = 'staff-001';

  const baseStore = {
    id: storeId,
    status: 'ACTIVE',
    timezone: 'Asia/Ho_Chi_Minh',
    slotIntervalMins: 30,
    cancelBeforeHours: 2,
    maxAdvanceDays: 30,
  };

  const baseVariant = {
    id: variantId,
    serviceId,
    name: 'Gói cơ bản',
    duration: 60,
    status: 'ACTIVE',
  };

  const baseWorkingHour = {
    storeId,
    dayOfWeek: 'MONDAY',
    openTime: '08:00',
    closeTime: '20:00',
    isClosed: false,
  };

  const baseSchedule = {
    staffId,
    dayOfWeek: 'MONDAY',
    startTime: '09:00',
    endTime: '18:00',
    isActive: true,
  };

  const baseStaffRecord = {
    id: staffId,
    user: { fullName: 'Nhân Viên Test', avatarUrl: null },
  };

  beforeEach(() => {
    prisma = {
      store: { findUnique: jest.fn().mockResolvedValue(baseStore) },
      serviceVariant: { findFirst: jest.fn().mockResolvedValue(baseVariant) },
      workingHour: { findFirst: jest.fn().mockResolvedValue(baseWorkingHour) },
      staff: {
        findFirst: jest.fn().mockResolvedValue({ id: staffId, storeId, status: 'ACTIVE' }),
        findUnique: jest.fn().mockResolvedValue(baseStaffRecord),
      },
      staffService: {
        findFirst: jest.fn().mockResolvedValue({ staffId, serviceId }),
        findMany: jest.fn().mockResolvedValue([{ staffId }]),
      },
      staffSchedule: { findFirst: jest.fn().mockResolvedValue(baseSchedule) },
      staffDayOff: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    service = new SlotsService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── store / service validation ───────────────────────────────────────────

  describe('store and service validation', () => {
    it('throws NotFoundException when store is not found', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.getAvailableSlots(storeId, { date: '2026-06-02', serviceId, variantId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when store status is PENDING', async () => {
      prisma.store.findUnique.mockResolvedValue({ ...baseStore, status: 'PENDING' });

      await expect(
        service.getAvailableSlots(storeId, { date: '2026-06-02', serviceId, variantId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when variant is not found for this store', async () => {
      prisma.serviceVariant.findFirst.mockResolvedValue(null);

      await expect(
        service.getAvailableSlots(storeId, { date: '2026-06-02', serviceId, variantId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── date validation ──────────────────────────────────────────────────────

  describe('date validation', () => {
    it('throws BadRequestException for a past date', async () => {
      await expect(
        service.getAvailableSlots(storeId, { date: '2020-01-01', serviceId, variantId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when date exceeds maxAdvanceDays', async () => {
      prisma.store.findUnique.mockResolvedValue({ ...baseStore, maxAdvanceDays: 7 });
      const farFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      await expect(
        service.getAvailableSlots(storeId, { date: farFuture, serviceId, variantId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── store closed day ─────────────────────────────────────────────────────

  describe('store closed handling', () => {
    it('returns empty staffSlots when store is closed on that day', async () => {
      prisma.workingHour.findFirst.mockResolvedValue({ ...baseWorkingHour, isClosed: true });

      const tomorrow = getDateStr(1);
      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      expect(result.staffSlots).toHaveLength(0);
    });

    it('returns empty staffSlots when no working hours record exists', async () => {
      prisma.workingHour.findFirst.mockResolvedValue(null);

      const tomorrow = getDateStr(1);
      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      expect(result.staffSlots).toHaveLength(0);
    });
  });

  // ─── staff validation ─────────────────────────────────────────────────────

  describe('specific staff validation', () => {
    it('throws NotFoundException when specific staffId is not in this store', async () => {
      prisma.staff.findFirst.mockResolvedValue(null);

      const tomorrow = getDateStr(1);
      await expect(
        service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId, staffId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when staff cannot perform the requested service', async () => {
      prisma.staffService.findFirst.mockResolvedValue(null);

      const tomorrow = getDateStr(1);
      await expect(
        service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId, staffId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── slot generation ──────────────────────────────────────────────────────

  describe('slot generation', () => {
    it('returns empty staffSlots when no qualified staff found', async () => {
      prisma.staffService.findMany.mockResolvedValue([]);

      const tomorrow = getDateStr(1);
      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      expect(result.staffSlots).toHaveLength(0);
    });

    it('returns empty staffSlots when staff has no active schedule for that day', async () => {
      prisma.staffSchedule.findFirst.mockResolvedValue(null);

      const tomorrow = getDateStr(1);
      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      expect(result.staffSlots).toHaveLength(0);
    });

    it('returns empty staffSlots when staff is on day off', async () => {
      prisma.staffDayOff.findFirst.mockResolvedValue({ staffId, date: new Date() });

      const tomorrow = getDateStr(1);
      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      expect(result.staffSlots).toHaveLength(0);
    });

    it('returns available slots for staff when there are no busy appointments', async () => {
      const tomorrow = getDateStr(1);
      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      expect(result.staffSlots).toHaveLength(1);
      expect(result.staffSlots[0].staffId).toBe(staffId);
      expect(result.staffSlots[0].availableSlots.length).toBeGreaterThan(0);
    });

    it('slots are formatted as HH:mm strings', async () => {
      const tomorrow = getDateStr(1);
      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      const slotPattern = /^\d{2}:\d{2}$/;
      result.staffSlots[0].availableSlots.forEach((slot) => {
        expect(slot).toMatch(slotPattern);
      });
    });

    it('excludes slots that overlap with existing appointments', async () => {
      // Busy from 09:00–10:00 UTC+7 → store schedule 09:00-18:00, service 60min
      // This appointment occupies the 09:00 slot
      const tomorrow = getDateStr(1);
      const tomorrowDate = new Date(tomorrow + 'T02:00:00.000Z'); // 09:00 UTC+7
      prisma.appointment.findMany.mockResolvedValue([
        { scheduledAt: tomorrowDate, duration: 60 },
      ]);

      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      if (result.staffSlots.length > 0) {
        expect(result.staffSlots[0].availableSlots).not.toContain('09:00');
      }
    });

    it('returns correct response shape with date, serviceId, serviceDuration, slotIntervalMins', async () => {
      const tomorrow = getDateStr(1);
      const result = await service.getAvailableSlots(storeId, { date: tomorrow, serviceId, variantId });

      expect(result).toMatchObject({
        date: tomorrow,
        serviceId,
        serviceDuration: baseVariant.duration,
        slotIntervalMins: baseStore.slotIntervalMins,
      });
    });
  });
});

function getDateStr(daysFromNow: number): string {
  // Calculate tomorrow in UTC+7 (Vietnam timezone)
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000 + daysFromNow * 24 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
