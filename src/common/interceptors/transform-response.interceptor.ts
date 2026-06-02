import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function convertDecimals(value: unknown): unknown {
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (Array.isArray(value)) return value.map(convertDecimals);
  if (value instanceof Date) return value;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, convertDecimals(v)]),
    );
  }
  return value;
}

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: any) => {
        if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
          return data;
        }

        // Tách pagination ra meta nếu service trả { items, total, page, limit }
        if (
          data &&
          typeof data === 'object' &&
          Array.isArray(data.items) &&
          typeof data.total === 'number'
        ) {
          const { items, total, page, limit } = data;
          return {
            success: true,
            message: 'Thành công',
            data: convertDecimals(items),
            meta: {
              total,
              page: page ?? 1,
              limit: limit ?? items.length,
              totalPages: limit ? Math.ceil(total / limit) : 1,
            },
          };
        }

        return {
          success: true,
          message: 'Thành công',
          data: convertDecimals(data),
        };
      }),
    );
  }
}
