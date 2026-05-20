import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { RedisService } from '../../../redis/redis.service';
import { ALL_PERMISSION_CODES } from '../../../common/constants/permissions';

const CUSTOMER_ROLE_CODE = 'CUSTOMER';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: { include: { role: { select: { name: true, code: true } } } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return null;
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return null;
    const { password: _, ...rest } = user;
    return { ...rest, roles: user.userRoles.map((ur) => ur.role.name) };
  }

  async login(user: { id: string; email: string; roles: string[] }) {
    const accessToken = this._signAccess(user.id, user.email);
    const refreshToken = this._signRefresh(user.id, user.email);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(refreshToken, 10) },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, roles: user.roles },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);

    const customerRole = await this.prisma.role.findFirst({
      where: { code: CUSTOMER_ROLE_CODE, shopId: null },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        fullName: dto.fullName ?? '',
        phone: dto.phone,
        ...(customerRole
          ? { userRoles: { create: { roleId: customerRole.id, shopId: null } } }
          : {}),
      },
      select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
    });

    return user;
  }

  async refresh(refreshToken: string) {
    const blacklistKey = `blacklist:refresh:${refreshToken}`;
    const isBlacklisted = await this.redis.exists(blacklistKey);
    if (isBlacklisted) throw new UnauthorizedException('Refresh token has been revoked');

    let payload: { sub: string; email: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User not found or inactive');
    }
    if (!user.refreshToken || !(await bcrypt.compare(refreshToken, user.refreshToken))) {
      throw new UnauthorizedException('Refresh token mismatch');
    }

    const newAccess = this._signAccess(user.id, user.email);
    const newRefresh = this._signRefresh(user.id, user.email);

    // Blacklist cũ, lưu hash mới
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 604800;
    if (ttl > 0) await this.redis.set(blacklistKey, '1', ttl);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(newRefresh, 10) },
    });

    return { access_token: newAccess, refresh_token: newRefresh };
  }

  async logout(userId: string, refreshToken: string) {
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 604800;
    if (ttl > 0) {
      await this.redis.set(`blacklist:refresh:${refreshToken}`, '1', ttl);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        userRoles: {
          select: {
            shopId: true,
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      ...user,
      roles: user.userRoles.map((ur) => ({
        code: ur.role.code,
        name: ur.role.name,
        shopId: ur.shopId,
      })),
      userRoles: undefined,
    };
  }

  async getPermissionMatrix(userId: string, shopId?: string) {
    // shopId=undefined → tìm system role (shopId IS NULL)
    // shopId có giá trị → tìm shop-specific role
    const userRole = await this.prisma.userRole.findFirst({
      where: { userId, shopId: shopId ?? null },
      select: {
        roleId: true,
        shopId: true,
        role: {
          select: {
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });

    if (!userRole) {
      return { roleId: null, shopId: shopId ?? null, grantedPermissionCodes: [] };
    }

    const granted = new Set(userRole.role.permissions.map((rp) => rp.permission.code));

    const permissionMatrix = ALL_PERMISSION_CODES.reduce<Record<string, boolean>>((acc, code) => {
      acc[code] = granted.has(code);
      return acc;
    }, {});

    return {
      roleId: userRole.roleId,
      shopId: userRole.shopId,
      permissionMatrix,
    };
  }

  private _signAccess(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  private _signRefresh(userId: string, email: string): string {
    const options: JwtSignOptions = {
      secret:
        this.config.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret',
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    } as JwtSignOptions;

    return this.jwtService.sign(
      { sub: userId, email },
      options,
    );
  }
}
