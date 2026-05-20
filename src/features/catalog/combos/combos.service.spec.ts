import { NotFoundException } from '@nestjs/common';
import { ComboStatus } from '@prisma/client';
import { CombosService } from './combos.service';

describe('CombosService — Phase 3 Catalog', () => {
  let service: CombosService;
  let prisma: any;
  let tx: any;

  const baseCombo = {
    id: 'combo-1',
    shopId: 'store-1',
    name: 'Gói Chăm Sóc Da Toàn Diện',
    description: 'Facial + Massage',
    price: 850000,
    estimatedDurationMinutes: 120,
    status: ComboStatus.ACTIVE,
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Chăm sóc da' },
    items: [
      { id: 'ci-1', serviceId: 'svc-1', quantity: 1, sortOrder: 0, service: { id: 'svc-1', name: 'Facial' } },
      { id: 'ci-2', serviceId: 'svc-2', quantity: 1, sortOrder: 1, service: { id: 'svc-2', name: 'Massage' } },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    tx = {
      comboItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      combo: {
        update: jest.fn(),
      },
    };

    prisma = {
      combo: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    service = new CombosService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  it('creates combo with service items and default ACTIVE status', async () => {
    prisma.combo.create.mockResolvedValue(baseCombo);

    const result = await service.create('store-1', {
      name: 'Gói Chăm Sóc Da Toàn Diện',
      price: 850000,
      estimatedDurationMinutes: 120,
      categoryId: 'cat-1',
      serviceIds: [
        { serviceId: 'svc-1', quantity: 1, order: 0 },
        { serviceId: 'svc-2', quantity: 1, order: 1 },
      ],
    });

    expect(prisma.combo.create).toHaveBeenCalledWith({
      data: {
        shopId: 'store-1',
        name: 'Gói Chăm Sóc Da Toàn Diện',
        description: undefined,
        price: 850000,
        estimatedDurationMinutes: 120,
        status: ComboStatus.ACTIVE,
        categoryId: 'cat-1',
        items: {
          create: [
            { serviceId: 'svc-1', quantity: 1, sortOrder: 0 },
            { serviceId: 'svc-2', quantity: 1, sortOrder: 1 },
          ],
        },
      },
      include: expect.any(Object),
    });
    expect(result.items).toHaveLength(2);
  });

  it('creates combo without items when serviceIds is not provided', async () => {
    prisma.combo.create.mockResolvedValue({ ...baseCombo, items: [] });

    await service.create('store-1', {
      name: 'Simple Combo',
      price: 500000,
    });

    expect(prisma.combo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ items: undefined }),
      include: expect.any(Object),
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll returns combos for a store with active filter', async () => {
    prisma.combo.findMany.mockResolvedValue([baseCombo]);

    const result = await service.findAll({ storeId: 'store-1', status: ComboStatus.ACTIVE });

    expect(prisma.combo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'store-1', status: ComboStatus.ACTIVE },
        orderBy: { name: 'asc' },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('findAll filters by categoryId', async () => {
    prisma.combo.findMany.mockResolvedValue([]);

    await service.findAll({ storeId: 'store-1', categoryId: 'cat-2' });

    expect(prisma.combo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'store-1', categoryId: 'cat-2' },
      }),
    );
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne returns combo by id scoped to store', async () => {
    prisma.combo.findFirst.mockResolvedValue(baseCombo);

    const result = await service.findOne('combo-1', 'store-1');

    expect(prisma.combo.findFirst).toHaveBeenCalledWith({
      where: { id: 'combo-1', shopId: 'store-1' },
      include: expect.any(Object),
    });
    expect(result.id).toBe('combo-1');
  });

  it('findOne throws NotFoundException when combo not found', async () => {
    prisma.combo.findFirst.mockResolvedValue(null);

    await expect(service.findOne('missing', 'store-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update replaces items when serviceIds is provided', async () => {
    prisma.combo.findFirst
      .mockResolvedValueOnce(baseCombo)
      .mockResolvedValueOnce({ ...baseCombo, price: 900000 });

    await service.update('combo-1', 'store-1', {
      price: 900000,
      serviceIds: [{ serviceId: 'svc-3', quantity: 2, order: 0 }],
    });

    expect(tx.comboItem.deleteMany).toHaveBeenCalledWith({ where: { comboId: 'combo-1' } });
    expect(tx.comboItem.createMany).toHaveBeenCalledWith({
      data: [{ comboId: 'combo-1', serviceId: 'svc-3', quantity: 2, sortOrder: 0 }],
    });
    expect(tx.combo.update).toHaveBeenCalledWith({
      where: { id: 'combo-1' },
      data: expect.objectContaining({ price: 900000 }),
    });
  });

  it('update skips item replacement when serviceIds is not provided', async () => {
    prisma.combo.findFirst
      .mockResolvedValueOnce(baseCombo)
      .mockResolvedValueOnce({ ...baseCombo, name: 'Updated Combo' });

    await service.update('combo-1', 'store-1', { name: 'Updated Combo' });

    expect(tx.comboItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.comboItem.createMany).not.toHaveBeenCalled();
  });

  it('update throws NotFoundException when combo not found', async () => {
    prisma.combo.findFirst.mockResolvedValue(null);

    await expect(service.update('missing', 'store-1', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('remove soft-deletes combo by setting status to INACTIVE', async () => {
    prisma.combo.findFirst.mockResolvedValue(baseCombo);
    prisma.combo.update.mockResolvedValue({ ...baseCombo, status: ComboStatus.INACTIVE });

    const result = await service.remove('combo-1', 'store-1');

    expect(prisma.combo.update).toHaveBeenCalledWith({
      where: { id: 'combo-1' },
      data: { status: ComboStatus.INACTIVE },
    });
    expect(result).toEqual({ deleted: true });
  });

  it('remove throws NotFoundException for missing combo', async () => {
    prisma.combo.findFirst.mockResolvedValue(null);

    await expect(service.remove('missing', 'store-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.combo.update).not.toHaveBeenCalled();
  });
});
