import { NotFoundException } from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';
import { StaffScheduleService } from './staff-schedule.service';

describe('StaffScheduleService — Phase 3 Staff Schedule', () => {
  let service: StaffScheduleService;
  let prisma: any;
  let tx: any;

  const baseSchedule = {
    id: 'sched-1',
    shopId: 'store-1',
    staffId: 'staff-1',
    dayOfWeek: DayOfWeek.MONDAY,
    startTime: '09:00',
    endTime: '18:00',
    isActive: true,
    staff: {
      user: { id: 'user-1', fullName: 'Nhân Viên A', email: 'nv@test.com' },
    },
  };

  beforeEach(() => {
    tx = {
      staffSchedule: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    prisma = {
      staffSchedule: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    service = new StaffScheduleService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  it('creates a single schedule entry for a staff member', async () => {
    prisma.staffSchedule.create.mockResolvedValue(baseSchedule);

    const result = await service.create('store-1', 'staff-1', {
      dayOfWeek: DayOfWeek.MONDAY,
      startTime: '09:00',
      endTime: '18:00',
    });

    expect(prisma.staffSchedule.create).toHaveBeenCalledWith({
      data: {
        shopId: 'store-1',
        staffId: 'staff-1',
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '18:00',
        isActive: true,
      },
      include: expect.any(Object),
    });
    expect(result.dayOfWeek).toBe(DayOfWeek.MONDAY);
  });

  it('create sets isActive from dto when explicitly provided', async () => {
    prisma.staffSchedule.create.mockResolvedValue({ ...baseSchedule, isActive: false });

    await service.create('store-1', 'staff-1', {
      dayOfWeek: DayOfWeek.SUNDAY,
      startTime: '10:00',
      endTime: '14:00',
      isActive: false,
    });

    expect(prisma.staffSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  // ─── bulkUpsert ───────────────────────────────────────────────────────────

  it('bulkUpsert deletes all existing schedules then recreates with given data', async () => {
    prisma.staffSchedule.findMany.mockResolvedValue([baseSchedule]);
    tx.staffSchedule.deleteMany.mockResolvedValue({});
    tx.staffSchedule.createMany.mockResolvedValue({});

    const schedules = [
      { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '09:00', endTime: '17:00' },
    ];

    await service.bulkUpsert('store-1', 'staff-1', schedules);

    expect(tx.staffSchedule.deleteMany).toHaveBeenCalledWith({
      where: { shopId: 'store-1', staffId: 'staff-1' },
    });
    expect(tx.staffSchedule.createMany).toHaveBeenCalledWith({
      data: [
        { shopId: 'store-1', staffId: 'staff-1', dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00', isActive: true },
        { shopId: 'store-1', staffId: 'staff-1', dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '17:00', isActive: true },
        { shopId: 'store-1', staffId: 'staff-1', dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '09:00', endTime: '17:00', isActive: true },
      ],
    });
  });

  it('bulkUpsert only deletes when empty schedules array is given (clear schedule)', async () => {
    prisma.staffSchedule.findMany.mockResolvedValue([]);
    tx.staffSchedule.deleteMany.mockResolvedValue({});

    await service.bulkUpsert('store-1', 'staff-1', []);

    expect(tx.staffSchedule.deleteMany).toHaveBeenCalledWith({
      where: { shopId: 'store-1', staffId: 'staff-1' },
    });
    expect(tx.staffSchedule.createMany).not.toHaveBeenCalled();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll returns schedules for store+staff ordered by dayOfWeek', async () => {
    prisma.staffSchedule.findMany.mockResolvedValue([baseSchedule]);

    const result = await service.findAll('store-1', 'staff-1');

    expect(prisma.staffSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'store-1', staffId: 'staff-1' },
        orderBy: { dayOfWeek: 'asc' },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('findAll filters by dayOfWeek when provided', async () => {
    prisma.staffSchedule.findMany.mockResolvedValue([baseSchedule]);

    await service.findAll('store-1', 'staff-1', DayOfWeek.MONDAY);

    expect(prisma.staffSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'store-1', staffId: 'staff-1', dayOfWeek: DayOfWeek.MONDAY },
      }),
    );
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne returns schedule by id', async () => {
    prisma.staffSchedule.findUnique.mockResolvedValue(baseSchedule);

    const result = await service.findOne('sched-1');

    expect(prisma.staffSchedule.findUnique).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      include: expect.any(Object),
    });
    expect(result.id).toBe('sched-1');
  });

  it('findOne throws NotFoundException for missing schedule', async () => {
    prisma.staffSchedule.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update changes schedule fields', async () => {
    prisma.staffSchedule.findUnique.mockResolvedValue(baseSchedule);
    prisma.staffSchedule.update.mockResolvedValue({
      ...baseSchedule,
      startTime: '08:00',
      endTime: '16:00',
      isActive: false,
    });

    const result = await service.update('sched-1', {
      startTime: '08:00',
      endTime: '16:00',
      isActive: false,
    });

    expect(prisma.staffSchedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: {
        dayOfWeek: undefined,
        startTime: '08:00',
        endTime: '16:00',
        isActive: false,
      },
      include: expect.any(Object),
    });
    expect(result.startTime).toBe('08:00');
  });

  it('update throws NotFoundException for missing schedule', async () => {
    prisma.staffSchedule.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', { startTime: '09:00' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.staffSchedule.update).not.toHaveBeenCalled();
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('remove deletes schedule by id', async () => {
    prisma.staffSchedule.findUnique.mockResolvedValue(baseSchedule);
    prisma.staffSchedule.delete.mockResolvedValue(baseSchedule);

    const result = await service.remove('sched-1');

    expect(prisma.staffSchedule.delete).toHaveBeenCalledWith({ where: { id: 'sched-1' } });
    expect(result).toEqual({ deleted: true });
  });

  it('remove throws NotFoundException for missing schedule', async () => {
    prisma.staffSchedule.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.staffSchedule.delete).not.toHaveBeenCalled();
  });
});
