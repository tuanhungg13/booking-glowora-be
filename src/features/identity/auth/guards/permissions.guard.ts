import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import {
  REQUIRED_PERMISSIONS_KEY,
  type PermissionsOptions,
} from '../../../../common/decorators/require-permissions.decorator';

const CACHE_PREFIX = 'user:permissions:';
const CACHE_TTL = 300; // 5 minutes

type PermissionGuardUser = { id: string; roles?: string[] };
type PermissionGuardRequest = Request & { user?: PermissionGuardUser };

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<
      PermissionsOptions | undefined
    >(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!options?.codes?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PermissionGuardRequest>();
    const user = request.user;
    if (!user?.id) {
      throw new ForbiddenException({
        message: 'Yêu cầu xác thực',
        errorCode: 'FORBIDDEN',
      });
    }

    const storeId = this.extractStoreIdFromRequest(request);
    const userPermissionCodes = await this.getUserPermissionCodes(
      user.id,
      storeId,
    );
    const required = new Set(options.codes);

    if (options.mode === 'all') {
      const hasAll =
        required.size > 0 &&
        [...required].every((code) => userPermissionCodes.has(code));
      if (!hasAll) {
        throw new ForbiddenException({
          message: `Không đủ quyền hạn. Yêu cầu: ${options.codes.join(', ')}`,
          errorCode: 'FORBIDDEN',
        });
      }
      return true;
    }

    const hasAny = [...required].some((code) => userPermissionCodes.has(code));
    if (!hasAny) {
      throw new ForbiddenException({
        message: `Không đủ quyền hạn. Một trong các quyền yêu cầu: ${options.codes.join(', ')}`,
        errorCode: 'FORBIDDEN',
      });
    }
    return true;
  }

  private extractStoreIdFromRequest(request: PermissionGuardRequest): string | null {
    const headerStoreId = this.extractStoreId(request.headers?.['x-store-id']);
    if (headerStoreId) return headerStoreId;

    const paramStoreId = request.params?.storeId;
    if (typeof paramStoreId === 'string' && paramStoreId.trim()) {
      return paramStoreId.trim();
    }

    const idParam = request.params?.id;
    if (typeof idParam === 'string' && this.isStoreIdRoute(request)) {
      return idParam.trim();
    }

    return null;
  }

  private isStoreIdRoute(request: PermissionGuardRequest): boolean {
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
    const idParam = request.params?.id;
    return Boolean(
      typeof idParam === 'string' &&
        path.startsWith('/stores/') &&
        !['mine', 'my-stores'].includes(idParam),
    );
  }

  private extractStoreId(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    if (Array.isArray(value)) {
      if (value.length !== 1) {
        throw new BadRequestException(
          'x-store-id phải chứa đúng một store id',
        );
      }
      return this.extractStoreId(value[0]);
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('x-store-id phải là chuỗi ký tự');
    }
    return value.trim() || null;
  }

  private async getUserPermissionCodes(
    userId: string,
    storeId: string | null,
  ): Promise<Set<string>> {
    const cacheKey = `${CACHE_PREFIX}${userId}:${storeId ?? 'system'}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        return new Set<string>(this.parseCachedPermissions(cached));
      }
    } catch (err) {
      this.logger.warn(
        'Redis read failed, falling back to DB',
        (err as Error).message,
      );
    }

    const codes = await this.loadPermissionsFromDb(userId, storeId);

    try {
      await this.redis.set(cacheKey, JSON.stringify([...codes]), CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis write failed', (err as Error).message);
    }

    return codes;
  }

  private parseCachedPermissions(value: string): string[] {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'string')
      ? parsed
      : [];
  }

  private async loadPermissionsFromDb(
    userId: string,
    storeId: string | null,
  ): Promise<Set<string>> {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: storeId
          ? [{ storeId }, { storeId: null, role: { code: 'SUPER_ADMIN' } }]
          : [{ storeId: null }],
      },
      select: {
        role: {
          select: {
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });

    const codes = new Set<string>();
    for (const { role } of userRoles) {
      for (const { permission } of role.permissions) {
        codes.add(permission.code);
      }
    }
    return codes;
  }
}
