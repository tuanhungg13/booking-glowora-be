import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import {
  REQUIRED_PERMISSIONS_KEY,
  type PermissionsOptions,
} from '../../../../common/decorators/require-permissions.decorator';

const CACHE_PREFIX = 'user:permissions:';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<PermissionsOptions | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options?.codes?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { id: string; roles?: string[] } | undefined;
    if (!user?.id) {
      throw new ForbiddenException('Authentication required');
    }

    const userPermissionCodes = await this.getUserPermissionCodes(user.id);
    const required = new Set(options.codes);

    if (options.mode === 'all') {
      const hasAll = required.size > 0 && [...required].every((code) => userPermissionCodes.has(code));
      if (!hasAll) {
        throw new ForbiddenException(
          `Insufficient permissions. Required: ${options.codes.join(', ')}`,
        );
      }
      return true;
    }

    const hasAny = [...required].some((code) => userPermissionCodes.has(code));
    if (!hasAny) {
      throw new ForbiddenException(
        `Insufficient permissions. One of required: ${options.codes.join(', ')}`,
      );
    }
    return true;
  }

  private async getUserPermissionCodes(userId: string): Promise<Set<string>> {
    const cacheKey = `${CACHE_PREFIX}${userId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        return new Set<string>(JSON.parse(cached));
      }
    } catch (err) {
      this.logger.warn('Redis read failed, falling back to DB', (err as Error).message);
    }

    const codes = await this.loadPermissionsFromDb(userId);

    try {
      await this.redis.set(cacheKey, JSON.stringify([...codes]), CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis write failed', (err as Error).message);
    }

    return codes;
  }

  private async loadPermissionsFromDb(userId: string): Promise<Set<string>> {
    type UserWithRolePerms = {
      roles: { role: { permissions: { permission: { code: string } }[] } }[];
    };

    const user = await (this.prisma as unknown as {
      user: {
        findUnique: (args: {
          where: { id: string };
          select: object;
        }) => Promise<UserWithRolePerms | null>;
      };
    }).user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
      },
    });

    const codes = new Set<string>();
    if (!user) return codes;
    for (const { role } of user.roles) {
      for (const { permission } of role.permissions) {
        codes.add(permission.code);
      }
    }
    return codes;
  }
}
