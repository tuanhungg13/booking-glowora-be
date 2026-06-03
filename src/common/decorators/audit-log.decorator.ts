import { SetMetadata } from '@nestjs/common';
import { LogType } from '@prisma/client';

export const AUDIT_LOG_KEY = 'auditLog';

export type AuditLogOptions = {
  type: LogType;
  targetType?: string;
  targetIdParam?: string;
};

export const AuditLog = (options: AuditLogOptions) =>
  SetMetadata(AUDIT_LOG_KEY, options);
