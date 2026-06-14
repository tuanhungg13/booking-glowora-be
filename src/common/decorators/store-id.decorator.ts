import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';

export const StoreId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const value = ctx.switchToHttp().getRequest<Request>().headers[
      'x-store-id'
    ];

    if (Array.isArray(value)) {
      if (value.length !== 1) {
        throw new BadRequestException(
          'x-store-id must contain exactly one store id',
        );
      }
      return value[0];
    }

    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Thiếu header x-store-id');
    }

    return value.trim();
  },
);
