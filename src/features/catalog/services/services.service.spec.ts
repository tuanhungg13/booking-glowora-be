import { NotFoundException } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { ServicesService } from './services.service';

describe('ServicesService — Phase 3 Catalog', () => {
  let service: ServicesService;
  let prisma: any;
  let tx: any;

  const baseService = {
    id: 'svc-1',
    shopId: 'store-1',
    name: 'Facial Treatment',
    description: 'Deep cleansing facial',
    duration: 60,
    price: 350000,
    costPrice: 100000,
    status: ServiceStatus.ACTIVE,
    categoryId: 'cat-1',
    avgRating: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    category: { id: 'cat-1', name: 'Chăm sóc da' },
    staffs: [],
  };

  beforeEach(() => {
    tx = {
      staffService: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    prisma = {
      service: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      staffService: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    service = new ServicesService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  it('creates service for a store with required and optional fields', async () => {
    prisma.service.create.mockResolvedValue(baseService);

    const result = await service.create('store-1', {
      name: 'Facial Treatment',
      duration: 60,
      price: 350000,
      costPrice: 100000,
      categoryId: 'cat-1',
    });

    expect(prisma.service.create).toHaveBeenCalledWith({
      data: {
        shopId: 'store-1',
        name: 'Facial Treatment',
        description: undefined,
        duration: 60,
        price: 350000,
        costPrice: 100000,
        status: ServiceStatus.ACTIVE,
        categoryId: 'cat-1',
      },
      include: expect.any(Object),
    });
    expect(result.shopId).toBe('store-1');
  });

  it('creates service with default ACTIVE status when status is not provided', async () => {
    prisma.service.create.mockResolvedValue(baseService);

    await service.create('store-1', { name: 'Massage', duration: 90, price: 500000 });

    expect(prisma.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ServiceStatus.ACTIVE }),
      }),
    );
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll returns all services for a store filtered by storeId', async () => {
    prisma.service.findMany.mockResolvedValue([baseService]);

    const result = await service.findAll({ storeId: 'store-1' });

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'store-1' },
        orderBy: { name: 'asc' },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('findAll applies status and categoryId filters', async () => {
    prisma.service.findMany.mockResolvedValue([]);

    await service.findAll({
      storeId: 'store-1',
      status: ServiceStatus.INACTIVE,
      categoryId: 'cat-1',
    });

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId: 'store-1',
          status: ServiceStatus.INACTIVE,
          categoryId: 'cat-1',
        },
      }),
    );
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne returns service by id scoped to store', async () => {
    prisma.service.findFirst.mockResolvedValue(baseService);

    const result = await service.findOne('svc-1', 'store-1');

    expect(prisma.service.findFirst).toHaveBeenCalledWith({
      where: { id: 'svc-1', shopId: 'store-1' },
      include: expect.any(Object),
    });
    expect(result.id).toBe('svc-1');
  });

  it('findOne throws NotFoundException when service not found', async () => {
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(service.findOne('missing', 'store-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update modifies service fields and returns updated entity', async () => {
    const updatedService = { ...baseService, price: 400000, name: 'Premium Facial' };
    prisma.service.findFirst
      .mockResolvedValueOnce(baseService)
      .mockResolvedValueOnce(updatedService);
    prisma.service.update.mockResolvedValue(updatedService);

    const result = await service.update('svc-1', 'store-1', { name: 'Premium Facial', price: 400000 });

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: {
        name: 'Premium Facial',
        description: undefined,
        duration: undefined,
        price: 400000,
        costPrice: undefined,
        status: undefined,
        categoryId: undefined,
      },
    });
    expect(result.price).toBe(400000);
  });

  it('update throws NotFoundException when service not in this store', async () => {
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(service.update('svc-other', 'store-1', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  // ─── assignStaff ──────────────────────────────────────────────────────────

  it('assignStaff replaces all StaffService records for the service', async () => {
    prisma.service.findFirst.mockResolvedValue(baseService);
    prisma.service.findUnique.mockResolvedValue({ ...baseService, staffs: [{ staffId: 'staff-2' }] });

    await service.assignStaff('svc-1', 'store-1', ['staff-1', 'staff-2']);

    expect(tx.staffService.deleteMany).toHaveBeenCalledWith({ where: { serviceId: 'svc-1' } });
    expect(tx.staffService.createMany).toHaveBeenCalledWith({
      data: [
        { serviceId: 'svc-1', staffId: 'staff-1' },
        { serviceId: 'svc-1', staffId: 'staff-2' },
      ],
      skipDuplicates: true,
    });
  });

  it('assignStaff clears all staff when empty array is passed', async () => {
    prisma.service.findFirst.mockResolvedValue(baseService);
    prisma.service.findUnique.mockResolvedValue({ ...baseService, staffs: [] });

    await service.assignStaff('svc-1', 'store-1', []);

    expect(tx.staffService.deleteMany).toHaveBeenCalledWith({ where: { serviceId: 'svc-1' } });
    expect(tx.staffService.createMany).not.toHaveBeenCalled();
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('remove soft-deletes service by setting status to INACTIVE', async () => {
    prisma.service.findFirst.mockResolvedValue(baseService);
    prisma.service.update.mockResolvedValue({ ...baseService, status: ServiceStatus.INACTIVE });

    const result = await service.remove('svc-1', 'store-1');

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { status: ServiceStatus.INACTIVE },
    });
    expect(result).toEqual({ deleted: true });
  });

  it('remove throws NotFoundException for missing service', async () => {
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(service.remove('missing', 'store-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.service.update).not.toHaveBeenCalled();
  });
});
