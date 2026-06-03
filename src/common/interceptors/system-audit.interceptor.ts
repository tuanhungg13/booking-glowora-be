import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  AUDIT_LOG_KEY,
  type AuditLogOptions,
} from '../decorators/audit-log.decorator';
import { SystemLogService } from '../../system-log/system-log.service';

type AuditRequest = Request & {
  user?: { id?: string };
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  systemLogErrorRecorded?: boolean;
};

@Injectable()
export class SystemAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly systemLog: SystemLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditLogOptions | undefined>(
      AUDIT_LOG_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return next.handle();

    const request = context.switchToHttp().getRequest<AuditRequest>();

    return next.handle().pipe(
      catchError((error) => {
        this.systemLog.logError(
          {
            type: options.type,
            actorId: request.user?.id,
            targetId: this.getTargetId(request, options),
            targetType: options.targetType,
            metadata: {
              method: request.method,
              path: request.originalUrl ?? request.url,
              params: request.params,
              query: request.query,
              body: this.redact(request.body),
            },
          },
          error,
        );
        request.systemLogErrorRecorded = true;

        return throwError(() => error);
      }),
    );
  }

  private getTargetId(
    request: AuditRequest,
    options: AuditLogOptions,
  ): string | undefined {
    const paramName = options.targetIdParam ?? 'id';
    const value = request.params?.[paramName];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (value === null || typeof value !== 'object') return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (this.isSensitiveKey(key)) return [key, '[REDACTED]'];
        return [key, this.redact(item)];
      }),
    );
  }

  private isSensitiveKey(key: string): boolean {
    return [
      'password',
      'newpassword',
      'currentpassword',
      'otp',
      'access_token',
      'refresh_token',
      'authorization',
      'cookie',
      'token',
    ].includes(key.toLowerCase());
  }
}
