import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * System-level role guard metadata.
 * Example: @Roles('SUPER_ADMIN', 'SHOP_OWNER')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

