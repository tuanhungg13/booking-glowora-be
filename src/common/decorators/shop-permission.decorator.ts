import { RequirePermissions, PermissionsOptions } from './require-permissions.decorator';

/**
 * Alias for RequirePermissions, used to express that the permissions
 * are evaluated in the context of a specific shop.
 *
 * Example:
 *   @ShopPermission('CREATE_SERVICE')
 *   @ShopPermission({ mode: 'all', codes: ['VIEW_SERVICE', 'UPDATE_SERVICE'] })
 */
export const ShopPermission = (
  ...args: [string, ...string[]] | [PermissionsOptions]
) => RequirePermissions(...(args as Parameters<typeof RequirePermissions>));

