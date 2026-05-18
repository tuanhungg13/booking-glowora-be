import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
            data: items,
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
          data,
        };
      }),
    );
  }
}
