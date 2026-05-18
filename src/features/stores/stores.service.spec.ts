import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DayOfWeek, StoreStatus } from '@prisma/client';
import { StoresService } from './stores.service';

describe('StoresService - Phase 2 Store owner flow', () => {
  let service: StoresService;
  let prisma: any;
  let permissionCache: any;
  let tx: any;

  const createDto = {
    name: 'Glowora Spa',
    address: '123 Nguyen Du',
    city: 'Ha Noi',
    district: 'Cau Giay',
    phone: '0901234567',
    email: 'contact@glowora.vn',
    website: 'https://glowora.vn',
    description: 'Spa cham soc da.',
    slotIntervalMins: 30,
    cancelBeforeHours: 2,
    maxAdvanceDays: 30,
    autoConfirm: false,
  };

  beforeEach(() => {
    tx = {
      store: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      workingHour: {
        createMany: jest.fn(),
        upsert: jest.fn(),
      },
      role: {
        create: jest.fn(),
      },
      rolePermission: {
        createMany: jest.fn(),
      },
      userRole: {
        create: jest.fn(),
      },
    };

    prisma = {
      store: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userRole: {
        count: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      workingHour: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (input: any) => {
        if (typeof input === 'function') return input(tx);
        return Promise.all(input);
      }),
    };

    permissionCache = {
      invalidateUser: jest.fn(),
    };

    service = new StoresService(prisma, permissionCache);
  });

  it('creates a pending store, default working hours, cloned owner role, and owner userRole', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    prisma.userRole.count.mockResolvedValue(0);
    prisma.role.findFirst.mockResolvedValue({
      id: 'role-template-owner',
      name: 'Shop Owner',
      code: 'SHOP_OWNER',
      description: 'Owner template',
      permissions: [{ permissionId: 'perm-create-service' }, { permissionId: 'perm-update-store' }],
    });
    prisma.store.findUnique.mockResolvedValue(null);
    tx.store.create.mockResolvedValue({ id: 'store-1' });
    tx.role.create.mockResolvedValue({ id: 'role-owner-store-1' });
    tx.store.findUniqueOrThrow.mockResolvedValue({
      id: 'store-1',
      name: 'Glowora Spa',
      slug: 'glowora-spa-ha-noi',
      status: StoreStatus.PENDING,
    });

    const result = await service.create(createDto, 'owner-1');

    expect(tx.store.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'owner-1',
        name: 'Glowora Spa',
        slug: 'glowora-spa-ha-noi',
        status: StoreStatus.PENDING,
      }),
    });
    expect(tx.workingHour.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ storeId: 'store-1', dayOfWeek: DayOfWeek.MONDAY, isClosed: false }),
        expect.objectContaining({ storeId: 'store-1', dayOfWeek: DayOfWeek.SUNDAY, isClosed: true }),
      ]),
    });
    expect(tx.workingHour.createMany.mock.calls[0][0].data).toHaveLength(7);
    expect(tx.role.create).toHaveBeenCalledWith({
      data: {
        name: 'Shop Owner',
        code: 'SHOP_OWNER',
        description: 'Owner template',
        isSystem: false,
        shopId: 'store-1',
      },
    });
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { roleId: 'role-owner-store-1', permissionId: 'perm-create-service' },
        { roleId: 'role-owner-store-1', permissionId: 'perm-update-store' },
      ],
      skipDuplicates: true,
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'owner-1', roleId: 'role-owner-store-1', shopId: 'store-1' },
    });
    expect(permissionCache.invalidateUser).toHaveBeenCalledWith('owner-1');
    expect(result.status).toBe(StoreStatus.PENDING);
  });

  it('rejects duplicate store for same owner and address', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-existing' });

    await expect(service.create(createDto, 'owner-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.userRole.count).not.toHaveBeenCalled();
  });

  it('rejects create when owner already has 3 shop roles', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    prisma.userRole.count.mockResolvedValue(3);

    await expect(service.create(createDto, 'owner-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('rejects create when SHOP_OWNER template role is missing', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    prisma.userRole.count.mockResolvedValue(0);
    prisma.role.findFirst.mockResolvedValue(null);

    await expect(service.create(createDto, 'owner-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findAll only lists active stores and applies public filters with pagination', async () => {
    const findManyPromise = Promise.resolve([{ id: 'store-1', status: StoreStatus.ACTIVE }]);
    const countPromise = Promise.resolve(1);
    prisma.store.findMany.mockReturnValue(findManyPromise);
    prisma.store.count.mockReturnValue(countPromise);

    const result = await service.findAll({
      city: 'Ha Noi',
      q: 'Glowora',
      categoryId: '550e8400-e29b-41d4-a716-446655440000',
      minRating: 4,
      sort: 'newest',
      page: 2,
      limit: 10,
    });

    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: StoreStatus.ACTIVE,
          city: { contains: 'Ha Noi' },
          avgRating: { gte: 4 },
          services: {
            some: {
              categoryId: '550e8400-e29b-41d4-a716-446655440000',
              status: 'ACTIVE',
            },
          },
        }),
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toEqual({
      items: [{ id: 'store-1', status: StoreStatus.ACTIVE }],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it('findOne only returns active store by id or slug', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1', slug: 'glowora-spa-ha-noi' });

    const result = await service.findOne('glowora-spa-ha-noi');

    expect(prisma.store.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: StoreStatus.ACTIVE,
          OR: [{ id: 'glowora-spa-ha-noi' }, { slug: 'glowora-spa-ha-noi' }],
        },
      }),
    );
    expect(result.id).toBe('store-1');
  });

  it('findOne throws NotFoundException when store is not public', async () => {
    prisma.store.findFirst.mockResolvedValue(null);

    await expect(service.findOne('missing-store')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateWorkingHours upserts exactly 7 validated working-hour records', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.ACTIVE,
    });
    prisma.workingHour.findMany.mockResolvedValue([{ storeId: 'store-1', dayOfWeek: DayOfWeek.MONDAY }]);
    const hours = [
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
      DayOfWeek.SUNDAY,
    ].map((dayOfWeek) => ({
      dayOfWeek,
      openTime: '08:00',
      closeTime: '20:00',
      isClosed: dayOfWeek === DayOfWeek.SUNDAY,
    }));

    await service.updateWorkingHours('store-1', 'owner-1', { hours });

    expect(tx.workingHour.upsert).toHaveBeenCalledTimes(7);
    expect(tx.workingHour.upsert).toHaveBeenCalledWith({
      where: { storeId_dayOfWeek: { storeId: 'store-1', dayOfWeek: DayOfWeek.MONDAY } },
      update: { openTime: '08:00', closeTime: '20:00', isClosed: false },
      create: {
        storeId: 'store-1',
        dayOfWeek: DayOfWeek.MONDAY,
        openTime: '08:00',
        closeTime: '20:00',
        isClosed: false,
      },
    });
  });

  it('rejects working hours with duplicate day or invalid time range', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.ACTIVE,
    });

    await expect(
      service.updateWorkingHours('store-1', 'owner-1', {
        hours: [
          { dayOfWeek: DayOfWeek.MONDAY, openTime: '08:00', closeTime: '20:00', isClosed: false },
          { dayOfWeek: DayOfWeek.MONDAY, openTime: '09:00', closeTime: '18:00', isClosed: false },
        ] as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.updateWorkingHours('store-1', 'owner-1', {
        hours: [
          { dayOfWeek: DayOfWeek.MONDAY, openTime: '20:00', closeTime: '08:00', isClosed: false },
        ] as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checkOwnership rejects non-owner and banned store', async () => {
    prisma.store.findUnique.mockResolvedValueOnce({
      id: 'store-1',
      ownerId: 'owner-2',
      status: StoreStatus.ACTIVE,
    });

    await expect(service.checkOwnership('store-1', 'owner-1')).rejects.toBeInstanceOf(ForbiddenException);

    prisma.store.findUnique.mockResolvedValueOnce({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.BANNED,
    });

    await expect(service.checkOwnership('store-1', 'owner-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
