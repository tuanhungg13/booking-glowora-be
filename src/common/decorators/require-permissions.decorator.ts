import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

export type PermissionsOptions =
  | { mode: 'any'; codes: string[] }
  | { mode: 'all'; codes: string[] };

/**
 * Bảo vệ route theo quyền (permission).
 * - @RequirePermissions('a', 'b') → user cần có ít nhất một trong các quyền (any)
 * - @RequirePermissions({ mode: 'all', codes: ['a', 'b'] }) → user cần có đủ tất cả quyền
 */
export const RequirePermissions = (...args: [string, ...string[]] | [PermissionsOptions]) => {
  const options: PermissionsOptions =
    args.length === 1 && typeof args[0] === 'object' && 'mode' in args[0]
      ? args[0]
      : { mode: 'any', codes: args as string[] };
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, options);
};

/**
 * User cần có đủ tất cả các quyền liệt kê.
 */
export const RequireAllPermissions = (...codes: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, { mode: 'all', codes } as PermissionsOptions);
