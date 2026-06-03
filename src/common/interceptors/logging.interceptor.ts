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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl, ip, body, query, params } = req;
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
