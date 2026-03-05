import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  REQUIRED_PERMISSIONS_KEY,
  type PermissionsOptions,
} from '../../../../common/decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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
    const hasAll = required.size > 0 && [...required].every((code) => userPermissionCodes.has(code));

    if (options.mode === 'all') {
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
    type UserWithRolePerms = {
      roles: { role: { permissions: { permission: { code: string } }[] } }[];
    };
    const user = await (this.prisma as unknown as { user: { findUnique: (args: { where: { id: string }; select: object }) => Promise<UserWithRolePerms | null> } }).user.findUnique({
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
