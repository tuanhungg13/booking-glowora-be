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
  params?: Record<string, string>;
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
              path: request.originalUrl ?? request.url,
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
}
