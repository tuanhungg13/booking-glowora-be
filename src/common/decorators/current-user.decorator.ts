import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

export type CurrentUserPayload = {
  id: string;
  email: string;
  status?: UserStatus;
  /** Role names từ UserRole → Role (theo Store) */
  roles?: string[];
  /**
   * System-wide role, e.g. SUPER_ADMIN or CUSTOMER.
   * This comes from the JWT payload, not directly from Prisma.
   */
  systemRole?: string;
  /**
   * Optional list of permission codes granted to the user
   * in the current store context.
   */
  permissions?: string[];
};

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext): CurrentUserPayload | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;
    return data ? user?.[data] : user;
  },
);
