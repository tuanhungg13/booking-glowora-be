import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import { AdminStoresService } from './admin-stores.service';

describe('AdminStoresService - Phase 2 approval flow', () => {
  let service: AdminStoresService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      store: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      notification: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (input: any) => Promise.all(input)),
    };

    service = new AdminStoresService(prisma);
  });

  it('findAll lists stores for admin with status, city, search and pagination filters', async () => {
    const findManyPromise = Promise.resolve([{ id: 'store-1', status: StoreStatus.PENDING }]);
    const countPromise = Promise.resolve(1);
    prisma.store.findMany.mockReturnValue(findManyPromise);
    prisma.store.count.mockReturnValue(countPromise);

    const result = await service.findAll({
      status: StoreStatus.PENDING,
      city: 'Ha Noi',
      q: 'owner@example.com',
      page: 2,
      limit: 5,
    });

    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: StoreStatus.PENDING,
          city: { contains: 'Ha Noi' },
          OR: expect.arrayContaining([
            { name: { contains: 'owner@example.com' } },
            { owner: { email: { contains: 'owner@example.com' } } },
          ]),
        }),
        skip: 5,
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result).toEqual({
      items: [{ id: 'store-1', status: StoreStatus.PENDING }],
      total: 1,
      page: 2,
      limit: 5,
    });
  });

  it('findOne throws NotFoundException for missing store', async () => {
    prisma.store.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing-store')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('approves a pending store and stores approver metadata', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.PENDING,
    });
    prisma.store.update.mockResolvedValue({
      id: 'store-1',
      status: StoreStatus.ACTIVE,
      approvedById: 'admin-1',
    });

    const result = await service.approve('store-1', 'admin-1');

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: {
        status: StoreStatus.ACTIVE,
        approvedById: 'admin-1',
        approvedAt: expect.any(Date),
        rejectionReason: null,
      },
      include: expect.any(Object),
    });
    expect(result.status).toBe(StoreStatus.ACTIVE);
  });

  it('prevents admin from approving their own store', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-1',
      ownerId: 'admin-1',
      status: StoreStatus.PENDING,
    });

    await expect(service.approve('store-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('rejects a pending store and requires a reason', async () => {
    await expect(service.reject('store-1', { reason: '   ' })).rejects.toBeInstanceOf(BadRequestException);

    prisma.store.findUnique.mockResolvedValue({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.PENDING,
    });
    prisma.store.update.mockResolvedValue({
      id: 'store-1',
      status: StoreStatus.INACTIVE,
      rejectionReason: 'Missing license',
    });

    const result = await service.reject('store-1', { reason: ' Missing license ' });

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: {
        status: StoreStatus.INACTIVE,
        rejectionReason: 'Missing license',
      },
      include: expect.any(Object),
    });
    expect(result.status).toBe(StoreStatus.INACTIVE);
  });

  it('locks only active stores and requires a reason', async () => {
    await expect(service.lock('store-1', { reason: '' })).rejects.toBeInstanceOf(BadRequestException);

    prisma.store.findUnique.mockResolvedValue({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.ACTIVE,
    });
    prisma.store.update.mockResolvedValue({
      id: 'store-1',
      status: StoreStatus.BANNED,
      rejectionReason: 'Policy violation',
    });

    const result = await service.lock('store-1', { reason: ' Policy violation ' });

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: {
        status: StoreStatus.BANNED,
        rejectionReason: 'Policy violation',
      },
      include: expect.any(Object),
    });
    expect(result.status).toBe(StoreStatus.BANNED);
  });

  it('unlocks only banned stores', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.BANNED,
    });
    prisma.store.update.mockResolvedValue({
      id: 'store-1',
      status: StoreStatus.ACTIVE,
      rejectionReason: null,
    });

    const result = await service.unlock('store-1');

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: {
        status: StoreStatus.ACTIVE,
        rejectionReason: null,
      },
      include: expect.any(Object),
    });
    expect(result.status).toBe(StoreStatus.ACTIVE);
  });

  it('rejects invalid state transitions', async () => {
    prisma.store.findUnique.mockResolvedValueOnce({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.ACTIVE,
    });
    await expect(service.approve('store-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);

    prisma.store.findUnique.mockResolvedValueOnce({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.PENDING,
    });
    await expect(service.lock('store-1', { reason: 'Policy violation' })).rejects.toBeInstanceOf(BadRequestException);

    prisma.store.findUnique.mockResolvedValueOnce({
      id: 'store-1',
      ownerId: 'owner-1',
      status: StoreStatus.ACTIVE,
    });
    await expect(service.unlock('store-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
