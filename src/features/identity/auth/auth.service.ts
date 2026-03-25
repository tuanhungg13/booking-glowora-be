import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { RedisService } from '../../../redis/redis.service';
import { ALL_PERMISSION_CODES } from '../../../common/constants/permissions';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: { include: { role: { select: { name: true } } } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return null;
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return null;
    const { password: _, ...rest } = user;
    return { ...rest, roles: user.userRoles.map((ur) => ur.role.name) };
  }

  async login(user: { id: string; email: string; roles: string[] }) {
    return {
      access_token: this.jwtService.sign({
        sub: user.id,
        email: user.email,
      }),
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        fullName: dto.fullName,
        phone: dto.phone,
      },
      select: { id: true, email: true, fullName: true, phone: true },
    });
    return user;
  }

  async getPermissionMatrix(userId: string) {
    const cacheKey = `user:permissions:${userId}`;
    const cached = await this.redis.get(cacheKey);
    const grantedCodes = new Set<string>(cached ? JSON.parse(cached) : []);

    // Luôn lấy role info để trả về cho UI (nhẹ hơn so với join permission codes mỗi lần).
    const userRoles = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userRoles: {
          select: {
            shopId: true,
            role: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!userRoles) {
      throw new NotFoundException('User not found');
    }

    // Cache miss: load permission codes từ DB theo RolePermission mapping.
    if (cached === null) {
      const userWithPerms = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          userRoles: {
            select: {
              role: {
                select: {
                  permissions: {
                    select: {
                      permission: {
                        select: { code: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (userWithPerms) {
        for (const { role } of userWithPerms.userRoles) {
          for (const { permission } of role.permissions) {
            grantedCodes.add(permission.code);
          }
        }
      }

      await this.redis.set(cacheKey, JSON.stringify([...grantedCodes]), 300);
    }

    const permissionMatrix = ALL_PERMISSION_CODES.reduce<Record<string, boolean>>((acc, code) => {
      acc[code] = grantedCodes.has(code);
      return acc;
    }, {});

    const roles = userRoles.userRoles.map((ur) => ({
      userRole: { shopId: ur.shopId, roleId: ur.role.id },
      role: { code: ur.role.code, name: ur.role.name },
    }));

    return {
      userId,
      roles,
      grantedPermissionCodes: [...grantedCodes],
      permissionMatrix,
    };
  }
}
