import { NotFoundException } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { ServicesService } from './services.service';

describe('ServicesService — Phase 3 Catalog', () => {
  let service: ServicesService;
  let prisma: any;
  let tx: any;

  const baseVariant = {
    id: 'var-1',
    serviceId: 'svc-1',
    name: 'Gói cơ bản',
    duration: 60,
    price: 350000,
    costPrice: 100000,
    sortOrder: 0,
    status: ServiceStatus.ACTIVE,
  };

  const baseService = {
    id: 'svc-1',
    shopId: 'store-1',
    name: 'Facial Treatment',
    description: 'Deep cleansing facial',
    status: ServiceStatus.ACTIVE,
    categoryId: 'cat-1',
    avgRating: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    category: { id: 'cat-1', name: 'Chăm sóc da' },
    variants: [baseVariant],
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
        count: jest.fn().mockResolvedValue(0),
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

  it('creates service for a store with variants', async () => {
    prisma.service.create.mockResolvedValue(baseService);

    const result = await service.create('store-1', {
      name: 'Facial Treatment',
      categoryId: 'cat-1',
      variants: [{ name: 'Gói cơ bản', duration: 60, price: 350000, costPrice: 100000 }],
    });

    expect(prisma.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: 'store-1',
          name: 'Facial Treatment',
          status: ServiceStatus.ACTIVE,
          categoryId: 'cat-1',
          variants: expect.objectContaining({ create: expect.any(Array) }),
        }),
      }),
    );
    expect(result.shopId).toBe('store-1');
  });

  it('creates service with default ACTIVE status when status is not provided', async () => {
    prisma.service.create.mockResolvedValue(baseService);

    await service.create('store-1', {
      name: 'Massage',
      variants: [{ name: 'Gói cơ bản', duration: 90, price: 500000 }],
    });

    expect(prisma.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ServiceStatus.ACTIVE }),
      }),
    );
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll returns paginated services for a store', async () => {
    prisma.service.findMany.mockResolvedValue([baseService]);
    prisma.service.count.mockResolvedValue(1);

    const result = await service.findAll({ storeId: 'store-1' });

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'store-1' },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('findAll applies status and categoryId filters', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    prisma.service.count.mockResolvedValue(0);

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

  it('findAll respects custom page and limit', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    prisma.service.count.mockResolvedValue(30);

    const result = await service.findAll({ storeId: 'store-1', page: 2, limit: 10 });

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  // ─── findPublic ───────────────────────────────────────────────────────────

  it('findPublic returns only ACTIVE services from ACTIVE stores', async () => {
    prisma.service.findMany.mockResolvedValue([baseService]);
    prisma.service.count.mockResolvedValue(1);

    const result = await service.findPublic({});

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ServiceStatus.ACTIVE,
          store: { status: 'ACTIVE' },
        }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('findPublic filters by q (name and description search)', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    prisma.service.count.mockResolvedValue(0);

    await service.findPublic({ q: 'facial' });

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'facial' } },
            { description: { contains: 'facial' } },
          ],
        }),
      }),
    );
  });

  it('findPublic filters by storeId and categoryId', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    prisma.service.count.mockResolvedValue(0);

    await service.findPublic({ storeId: 'store-1', categoryId: 'cat-1' });

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 'store-1',
          categoryId: 'cat-1',
        }),
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
    const updatedService = { ...baseService, name: 'Premium Facial' };
    prisma.service.findFirst
      .mockResolvedValueOnce(baseService)
      .mockResolvedValueOnce(updatedService);
    prisma.service.update.mockResolvedValue(updatedService);

    const result = await service.update('svc-1', 'store-1', { name: 'Premium Facial' });

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: expect.objectContaining({ name: 'Premium Facial' }),
    });
    expect(result.name).toBe('Premium Facial');
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
