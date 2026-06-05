import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

const SKIP_LOGGING: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/auth/refresh' },
  { method: 'GET', path: '/auth/me' },
  { method: 'GET', path: '/auth/getMatrix' },
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/notifications' },
  { method: 'GET', path: '/slots/available' },
];

function shouldSkip(method: string, url: string): boolean {
  const path = url.split('?')[0];
  return SKIP_LOGGING.some((r) => r.method === method && r.path === path);
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl, ip, body, query, params } = req;

    if (shouldSkip(method, originalUrl)) return next.handle();
    const userAgent = req.headers['user-agent'] ?? '';
    const userId = (req as any).user?.id ?? 'anonymous';
    const requestId = (req as any).requestId as string;
    const start = Date.now();

    this.logger.log(
      `→ [${requestId}] ${method} ${originalUrl} | user=${userId} ip=${ip} | body=${JSON.stringify(body)} query=${JSON.stringify(query)} params=${JSON.stringify(params)}`,
    );

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.logger.log(
          `← [${requestId}] ${method} ${originalUrl} | ${res.statusCode} | ${ms}ms | user=${userId} agent=${userAgent}`,
        );
      }),
      catchError((err) => {
        const ms = Date.now() - start;
        const status = err?.status ?? 500;
        this.logger.error(
          `✗ [${requestId}] ${method} ${originalUrl} | ${status} | ${ms}ms | user=${userId} | ${err?.message}`,
        );
        return throwError(() => err);
      }),
    );
  }
}
