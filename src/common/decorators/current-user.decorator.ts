import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

export type CurrentUserPayload = Pick<User, 'id' | 'email' | 'status'> & {
  /** Role names từ UserRole → Role (theo shop) */
  roles?: string[];
  /**
   * System-wide role, e.g. SUPER_ADMIN, CUSTOMER, SHOP_OWNER, SHOP_STAFF.
   * This comes from the JWT payload, not directly from Prisma.
   */
  systemRole?: string;
  /**
   * Optional list of permission codes granted to the user
   * in the current shop context.
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
