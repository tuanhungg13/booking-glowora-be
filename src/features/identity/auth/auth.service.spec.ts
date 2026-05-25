import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService - Phase 1 Auth and RBAC', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let config: any;
  let redis: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      userRole: {
        findFirst: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn((_payload, options) => (options?.secret ? 'refresh-token-new' : 'access-token-new')),
      verifyAsync: jest.fn(),
      decode: jest.fn(),
    };

    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return values[key];
      }),
    };

    redis = {
      exists: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    };

    service = new AuthService(prisma, jwtService, config, redis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registers a new user and assigns CUSTOMER system role', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findFirst.mockResolvedValue({ id: 'role-customer', code: 'CUSTOMER', shopId: null });
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'customer@example.com',
      fullName: 'Customer A',
      phone: '0901234567',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.register({
      email: 'customer@example.com',
      password: 'Secret@123',
      fullName: 'Customer A',
      phone: '0901234567',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'customer@example.com',
        password: 'hashed-password',
        fullName: 'Customer A',
        phone: '0901234567',
        userRoles: { create: { roleId: 'role-customer', shopId: null } },
      },
      select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
    });
    expect(result.email).toBe('customer@example.com');
  });

  it('rejects register when email is already used', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.register({
        email: 'customer@example.com',
        password: 'Secret@123',
        fullName: 'Customer A',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates active user credentials and strips password from result', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'customer@example.com',
      password: 'hashed-password',
      status: UserStatus.ACTIVE,
      userRoles: [{ role: { name: 'Customer', code: 'CUSTOMER' } }],
    });

    const result = await service.validateUser('customer@example.com', 'Secret@123');

    expect(result).toMatchObject({
      id: 'user-1',
      email: 'customer@example.com',
      roles: ['Customer'],
    });
    expect(result).not.toHaveProperty('password');
  });

  it('login signs access and refresh tokens, then persists refresh token', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');

    const result = await service.login({
      id: 'user-1',
      email: 'customer@example.com',
      roles: ['Customer'],
    });

    expect(jwtService.sign).toHaveBeenCalledTimes(2);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { refreshToken: 'hashed-refresh-token' },
    });
    expect(result).toEqual({
      access_token: 'access-token-new',
      refresh_token: 'refresh-token-new',
      user: { id: 'user-1', email: 'customer@example.com', roles: ['Customer'] },
    });
  });

  it('refresh rotates tokens and blacklists the old refresh token', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-new-refresh-token');
    redis.exists.mockResolvedValue(0);
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', email: 'customer@example.com' });
    jwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'customer@example.com',
      status: UserStatus.ACTIVE,
      refreshToken: 'stored-hashed-token',
      userRoles: [],
    });

    const result = await service.refresh('refresh-token-old');

    expect(redis.set).toHaveBeenCalledWith('blacklist:refresh:refresh-token-old', '1', expect.any(Number));
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { refreshToken: 'hashed-new-refresh-token' },
    });
    expect(result).toEqual({
      access_token: 'access-token-new',
      refresh_token: 'refresh-token-new',
    });
  });

  it('rejects refresh when token is blacklisted', async () => {
    redis.exists.mockResolvedValue(1);

    await expect(service.refresh('refresh-token-old')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('getMe returns profile with role codes and shop context', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner A',
      phone: null,
      avatarUrl: null,
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      userRoles: [
        { shopId: null, role: { id: 'role-customer', code: 'CUSTOMER', name: 'Customer' } },
        { shopId: 'store-1', role: { id: 'role-owner', code: 'SHOP_OWNER', name: 'Shop Owner' } },
      ],
    });

    const result = await service.getMe('user-1');

    expect(result.roles).toEqual([
      { code: 'CUSTOMER', name: 'Customer', shopId: null },
      { code: 'SHOP_OWNER', name: 'Shop Owner', shopId: 'store-1' },
    ]);
    expect(result.userRoles).toBeUndefined();
  });

  it('getMe throws NotFoundException for missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getMe('missing-user')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds permission matrix from DB with granted and denied codes', async () => {
    prisma.userRole.findFirst.mockResolvedValue({
      roleId: 'role-customer',
      shopId: null,
      role: {
        permissions: [
          { permission: { code: 'VIEW_SERVICE' } },
          { permission: { code: 'CREATE_APPOINTMENT' } },
        ],
      },
    });

    const result = await service.getPermissionMatrix('user-1');

    expect(result.roleId).toBe('role-customer');
    expect(result.shopId).toBeNull();
    expect(result.permissionMatrix?.['VIEW_SERVICE']).toBe(true);
    expect(result.permissionMatrix?.['CREATE_APPOINTMENT']).toBe(true);
    expect(result.permissionMatrix?.['DELETE_SERVICE']).toBe(false);
  });

  it('getPermissionMatrix returns empty granted codes when user has no role', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    const result = await service.getPermissionMatrix('user-1');

    expect(result).toEqual({ roleId: null, shopId: null, grantedPermissionCodes: [] });
  });
});
