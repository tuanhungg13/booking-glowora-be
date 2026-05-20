import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, StaffStatus } from '@prisma/client';
import { StoreStaffService } from './store-staff.service';

describe('StoreStaffService — Phase 3 Staff Management', () => {
  let service: StoreStaffService;
  let prisma: any;
  let storesService: any;
  let permissionCache: any;
  let tx: any;

  const baseStaff = {
    id: 'staff-1',
    userId: 'user-staff-1',
    storeId: 'store-1',
    specialty: 'Massage, Facial',
    bio: 'Nhân viên có kinh nghiệm 3 năm',
    rating: 0,
    totalReviews: 0,
    status: StaffStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    user: { id: 'user-staff-1', fullName: 'Nhân Viên A', email: 'nhanvien@test.com', phone: null, avatarUrl: null },
    services: [],
  };

  const baseInvite = {
    id: 'invite-1',
    storeId: 'store-1',
    email: 'nhanvien@test.com',
    token: 'abc123token',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    staffId: null,
  };

  beforeEach(() => {
    tx = {
      staff: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      rolePermission: {
        createMany: jest.fn(),
      },
      userRole: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      staffInvite: {
        update: jest.fn(),
      },
    };

    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      staff: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      staffInvite: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      store: {
        findUniqueOrThrow: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    storesService = {
      checkOwnership: jest.fn(),
    };

    permissionCache = {
      invalidateUser: jest.fn(),
    };

    service = new StoreStaffService(prisma, storesService, permissionCache);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── invite ───────────────────────────────────────────────────────────────

  it('invite creates StaffInvite and sends in-app Notification', async () => {
    storesService.checkOwnership.mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-staff-1', email: 'nhanvien@test.com' });
    prisma.staff.findFirst.mockResolvedValue(null);
    prisma.staffInvite.findFirst.mockResolvedValue(null);
    prisma.store.findUniqueOrThrow.mockResolvedValue({ name: 'Glowora Spa' });
    prisma.staffInvite.create.mockResolvedValue(baseInvite);
    prisma.notification.create.mockResolvedValue({ id: 'notif-1' });

    const result = await service.invite('store-1', 'owner-1', { email: 'nhanvien@test.com' });

    expect(storesService.checkOwnership).toHaveBeenCalledWith('store-1', 'owner-1');
    expect(prisma.staffInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 'store-1',
        email: 'nhanvien@test.com',
        status: 'PENDING',
      }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-staff-1',
        type: NotificationType.STAFF_INVITED,
      }),
    });
    expect(result).toHaveProperty('invite');
    expect(result).toHaveProperty('token');
  });

  it('invite throws NotFoundException when invited user has no account', async () => {
    storesService.checkOwnership.mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.invite('store-1', 'owner-1', { email: 'nouser@test.com' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.staffInvite.create).not.toHaveBeenCalled();
  });

  it('invite throws ConflictException when user is already an active staff', async () => {
    storesService.checkOwnership.mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-staff-1', email: 'nhanvien@test.com' });
    prisma.staff.findFirst.mockResolvedValue(baseStaff);

    await expect(service.invite('store-1', 'owner-1', { email: 'nhanvien@test.com' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.staffInvite.create).not.toHaveBeenCalled();
  });

  it('invite throws ConflictException when a pending invite already exists for this email', async () => {
    storesService.checkOwnership.mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-staff-1', email: 'nhanvien@test.com' });
    prisma.staff.findFirst.mockResolvedValue(null);
    prisma.staffInvite.findFirst.mockResolvedValue(baseInvite);

    await expect(service.invite('store-1', 'owner-1', { email: 'nhanvien@test.com' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.staffInvite.create).not.toHaveBeenCalled();
  });

  // ─── acceptInvite ─────────────────────────────────────────────────────────

  it('acceptInvite creates Staff + UserRole + updates invite status and invalidates cache', async () => {
    prisma.staffInvite.findUnique.mockResolvedValue(baseInvite);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-staff-1', email: 'nhanvien@test.com' });
    prisma.staff.findFirst.mockResolvedValue(null);

    tx.role.findFirst.mockResolvedValue({
      id: 'role-staff-store-1',
      code: 'SHOP_STAFF',
      shopId: 'store-1',
    });
    tx.staff.create.mockResolvedValue({ id: 'staff-new' });
    tx.userRole.create.mockResolvedValue({});
    tx.staffInvite.update.mockResolvedValue({});
    tx.staff.findUniqueOrThrow.mockResolvedValue(baseStaff);

    const result = await service.acceptInvite({ token: 'abc123token' }, 'user-staff-1');

    expect(tx.staff.create).toHaveBeenCalledWith({
      data: { userId: 'user-staff-1', storeId: 'store-1', status: StaffStatus.ACTIVE },
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-staff-1',
        roleId: 'role-staff-store-1',
        shopId: 'store-1',
      },
    });
    expect(tx.staffInvite.update).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
      data: { status: 'ACCEPTED', staffId: 'staff-new' },
    });
    expect(permissionCache.invalidateUser).toHaveBeenCalledWith('user-staff-1');
    expect(result).toBe(baseStaff);
  });

  it('acceptInvite clones SHOP_STAFF template role when no shop-specific role exists yet', async () => {
    prisma.staffInvite.findUnique.mockResolvedValue(baseInvite);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-staff-1', email: 'nhanvien@test.com' });
    prisma.staff.findFirst.mockResolvedValue(null);

    // No shop-specific role → should find template
    tx.role.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'role-staff-template',
        code: 'SHOP_STAFF',
        name: 'Staff',
        description: null,
        permissions: [{ permissionId: 'perm-view-service' }],
      });
    tx.role.create.mockResolvedValue({ id: 'role-staff-cloned' });
    tx.rolePermission.createMany.mockResolvedValue({});
    tx.staff.create.mockResolvedValue({ id: 'staff-new' });
    tx.userRole.create.mockResolvedValue({});
    tx.staffInvite.update.mockResolvedValue({});
    tx.staff.findUniqueOrThrow.mockResolvedValue(baseStaff);

    await service.acceptInvite({ token: 'abc123token' }, 'user-staff-1');

    expect(tx.role.create).toHaveBeenCalledWith({
      data: {
        name: 'Staff',
        code: 'SHOP_STAFF',
        description: null,
        isSystem: false,
        shopId: 'store-1',
      },
    });
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'role-staff-cloned', permissionId: 'perm-view-service' }],
      skipDuplicates: true,
    });
  });

  it('acceptInvite throws BadRequestException for invalid or expired token', async () => {
    // Token not found
    prisma.staffInvite.findUnique.mockResolvedValue(null);
    await expect(service.acceptInvite({ token: 'bad-token' }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);

    // Token already used
    prisma.staffInvite.findUnique.mockResolvedValue({ ...baseInvite, status: 'ACCEPTED' });
    await expect(service.acceptInvite({ token: 'abc123token' }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);

    // Token expired
    prisma.staffInvite.findUnique.mockResolvedValue({
      ...baseInvite,
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.acceptInvite({ token: 'abc123token' }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('acceptInvite throws ForbiddenException when logged-in user email does not match invite', async () => {
    prisma.staffInvite.findUnique.mockResolvedValue(baseInvite);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-other', email: 'other@test.com' });

    await expect(service.acceptInvite({ token: 'abc123token' }, 'user-other'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('acceptInvite throws ConflictException when user is already an active staff of this store', async () => {
    prisma.staffInvite.findUnique.mockResolvedValue(baseInvite);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-staff-1', email: 'nhanvien@test.com' });
    prisma.staff.findFirst.mockResolvedValue(baseStaff);

    await expect(service.acceptInvite({ token: 'abc123token' }, 'user-staff-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── findAll / findOne ────────────────────────────────────────────────────

  it('findAll returns all staff of a store ordered by createdAt', async () => {
    prisma.staff.findMany.mockResolvedValue([baseStaff]);

    const result = await service.findAll('store-1');

    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 'store-1' },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('findOne throws NotFoundException when staff not in this store', async () => {
    prisma.staff.findFirst.mockResolvedValue(null);

    await expect(service.findOne('store-1', 'staff-missing'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('remove sets staff INACTIVE, deletes UserRole, and invalidates permission cache', async () => {
    storesService.checkOwnership.mockResolvedValue(undefined);
    prisma.staff.findFirst.mockResolvedValue(baseStaff);
    prisma.staff.update.mockResolvedValue({});
    tx.staff.update.mockResolvedValue({});
    tx.userRole.deleteMany.mockResolvedValue({});

    const result = await service.remove('store-1', 'owner-1', 'staff-1');

    expect(storesService.checkOwnership).toHaveBeenCalledWith('store-1', 'owner-1');
    expect(tx.staff.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { status: StaffStatus.INACTIVE },
    });
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-staff-1', shopId: 'store-1' },
    });
    expect(permissionCache.invalidateUser).toHaveBeenCalledWith('user-staff-1');
    expect(result).toEqual({ removed: true });
  });
});
