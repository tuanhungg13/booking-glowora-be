import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StaffDayOffService } from './staff-day-off.service';

describe('StaffDayOffService — Phase 3 Staff Day Off', () => {
  let service: StaffDayOffService;
  let prisma: any;

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(12, 0, 0, 0);

  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const baseDayOff = {
    id: 'dayoff-1',
    shopId: 'store-1',
    staffId: 'staff-1',
    date: tomorrow,
    reason: 'Nghỉ phép',
    staff: {
      user: { id: 'user-1', fullName: 'Nhân Viên A', email: 'nv@test.com' },
    },
  };

  beforeEach(() => {
    prisma = {
      staffDayOff: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new StaffDayOffService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  it('creates day off for a future date', async () => {
    prisma.staffDayOff.findFirst.mockResolvedValue(null);
    prisma.staffDayOff.create.mockResolvedValue(baseDayOff);

    const result = await service.create('store-1', 'staff-1', {
      date: tomorrowStr,
      reason: 'Nghỉ phép',
    });

    expect(prisma.staffDayOff.create).toHaveBeenCalledWith({
      data: {
        shopId: 'store-1',
        staffId: 'staff-1',
        date: new Date(tomorrowStr),
        reason: 'Nghỉ phép',
      },
      include: expect.any(Object),
    });
    expect(result.reason).toBe('Nghỉ phép');
  });

  it('create throws BadRequestException when date is in the past', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    await expect(
      service.create('store-1', 'staff-1', { date: yesterdayStr }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.staffDayOff.create).not.toHaveBeenCalled();
  });

  it('create throws BadRequestException when day off already exists for the same date', async () => {
    prisma.staffDayOff.findFirst.mockResolvedValue(baseDayOff);

    await expect(
      service.create('store-1', 'staff-1', { date: tomorrowStr }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.staffDayOff.create).not.toHaveBeenCalled();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll returns day offs ordered by date ascending', async () => {
    prisma.staffDayOff.findMany.mockResolvedValue([baseDayOff]);

    const result = await service.findAll('store-1', 'staff-1');

    expect(prisma.staffDayOff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'store-1', staffId: 'staff-1' },
        orderBy: { date: 'asc' },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('findAll applies from/to date range filter', async () => {
    prisma.staffDayOff.findMany.mockResolvedValue([]);
    const from = new Date('2026-06-01');
    const to = new Date('2026-06-30');

    await service.findAll('store-1', 'staff-1', { from, to });

    expect(prisma.staffDayOff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId: 'store-1',
          staffId: 'staff-1',
          date: { gte: from, lte: to },
        },
      }),
    );
  });

  it('findAll applies only "from" filter when "to" is not provided', async () => {
    prisma.staffDayOff.findMany.mockResolvedValue([]);
    const from = new Date('2026-06-01');

    await service.findAll('store-1', 'staff-1', { from });

    expect(prisma.staffDayOff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { gte: from } }),
      }),
    );
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne returns day off by id', async () => {
    prisma.staffDayOff.findUnique.mockResolvedValue(baseDayOff);

    const result = await service.findOne('dayoff-1');

    expect(prisma.staffDayOff.findUnique).toHaveBeenCalledWith({
      where: { id: 'dayoff-1' },
      include: expect.any(Object),
    });
    expect(result.id).toBe('dayoff-1');
  });

  it('findOne throws NotFoundException for missing day off', async () => {
    prisma.staffDayOff.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update changes reason without touching date', async () => {
    prisma.staffDayOff.findUnique.mockResolvedValue(baseDayOff);
    prisma.staffDayOff.update.mockResolvedValue({ ...baseDayOff, reason: 'Việc gia đình' });

    const result = await service.update('dayoff-1', { reason: 'Việc gia đình' });

    expect(prisma.staffDayOff.update).toHaveBeenCalledWith({
      where: { id: 'dayoff-1' },
      data: {
        date: undefined,
        reason: 'Việc gia đình',
      },
      include: expect.any(Object),
    });
    expect(result.reason).toBe('Việc gia đình');
  });

  it('update throws BadRequestException when new date is in the past', async () => {
    prisma.staffDayOff.findUnique.mockResolvedValue(baseDayOff);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    await expect(
      service.update('dayoff-1', { date: yesterdayStr }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.staffDayOff.update).not.toHaveBeenCalled();
  });

  it('update throws NotFoundException for missing day off', async () => {
    prisma.staffDayOff.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', { reason: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('remove hard-deletes day off by id', async () => {
    prisma.staffDayOff.findUnique.mockResolvedValue(baseDayOff);
    prisma.staffDayOff.delete.mockResolvedValue(baseDayOff);

    const result = await service.remove('dayoff-1');

    expect(prisma.staffDayOff.delete).toHaveBeenCalledWith({ where: { id: 'dayoff-1' } });
    expect(result).toEqual({ deleted: true });
  });

  it('remove throws NotFoundException for missing day off', async () => {
    prisma.staffDayOff.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.staffDayOff.delete).not.toHaveBeenCalled();
  });
});
