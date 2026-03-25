import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ResponseEnvelope<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: unknown;
  };
}

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseEnvelope> {
    return next.handle().pipe(
      map((data: any) => {
        // Avoid double-wrapping if controller already returns the envelope
        if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
          return data as ResponseEnvelope;
        }

        return {
          success: true,
          data,
        } as ResponseEnvelope;
      }),
    );
  }
}

