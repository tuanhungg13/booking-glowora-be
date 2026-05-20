import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ShopId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    return ctx.switchToHttp().getRequest().headers['x-shop-id'];
  },
);
