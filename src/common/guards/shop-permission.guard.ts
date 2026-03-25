import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PermissionsOptions,
  REQUIRED_PERMISSIONS_KEY,
} from '../decorators/require-permissions.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * Guard for shop-scoped permissions.
 *
 * It reads metadata from @RequirePermissions / @ShopPermission and
 * checks the permission codes against the `permissions` array on
 * the current user (populated from JWT).
 */
@Injectable()
export class ShopPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<PermissionsOptions | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload | undefined;

    if (!user) {
      return false;
    }

    // Super admins bypass shop-level permission checks
    if (user.systemRole === 'SUPER_ADMIN') {
      return true;
    }

    const userPermissions = user.permissions ?? [];

    if (options.mode === 'all') {
      return options.codes.every((code) => userPermissions.includes(code));
    }

    // default: any
    return options.codes.some((code) => userPermissions.includes(code));
  }
}

