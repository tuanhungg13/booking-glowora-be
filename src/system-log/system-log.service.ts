import { Injectable, Logger } from '@nestjs/common';
import { LogStatus, LogType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/request-context.service';

export interface LogData {
  type: LogType;
  status?: LogStatus;
  actorId?: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  requestId?: string;
}

export interface SystemLogFilter {
  type?: LogType;
  status?: LogStatus;
  actorId?: string;
  q?: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  ipAddress?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class SystemLogService {
  private readonly logger = new Logger(SystemLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  log(data: LogData): void {
    this.prisma.systemLog.create({
      data: this.buildCreateInput(data),
    }).catch((err: Error) => {
      this.logger.warn(`Failed to write system log: ${err.message}`);
    });
  }

  logSuccess(data: Omit<LogData, 'status'>): void {
    this.log({ ...data, status: LogStatus.SUCCESS });
  }

  logError(data: Omit<LogData, 'status'>, error: unknown): void {
    this.log({
      ...data,
      status: LogStatus.ERROR,
      metadata: {
        ...data.metadata,
        error: this.serializeError(error),
      },
    });
  }

  async findAll(filter: SystemLogFilter) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const createdAt: Prisma.DateTimeFilter = {};
    if (filter.dateFrom) createdAt.gte = new Date(`${filter.dateFrom}T00:00:00+07:00`);
    if (filter.dateTo) createdAt.lte = new Date(`${filter.dateTo}T23:59:59.999+07:00`);

    const where: Prisma.SystemLogWhereInput = {
      ...(filter.type && { type: filter.type }),
      ...(filter.status && { status: filter.status }),
      ...(filter.actorId && { actorId: filter.actorId }),
      ...(filter.targetId && { targetId: filter.targetId }),
      ...(filter.targetType && { targetType: filter.targetType }),
      ...(filter.requestId && { requestId: filter.requestId }),
      ...(filter.ipAddress && { ipAddress: filter.ipAddress }),
      ...(Object.keys(createdAt).length > 0 && { createdAt }),
      ...(filter.q && {
        actor: {
          OR: [
            { email: { contains: filter.q } },
            { fullName: { contains: filter.q } },
          ],
        },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.systemLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.systemLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private buildCreateInput(data: LogData): Prisma.SystemLogUncheckedCreateInput {
    return {
      type: data.type,
      status: data.status ?? LogStatus.SUCCESS,
      actorId: data.actorId ?? this.requestContext.getActorId(),
      targetId: data.targetId,
      targetType: data.targetType,
      metadata: data.metadata ? this.toJsonValue(this.redactSensitive(data.metadata)) : undefined,
      ipAddress: data.ipAddress ?? this.requestContext.getIpAddress(),
      requestId: data.requestId ?? this.requestContext.getRequestId(),
    } as Prisma.SystemLogUncheckedCreateInput;
  }

  private serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      const maybeError = error as Error & {
        status?: number;
        code?: string;
        response?: unknown;
      };

      return this.redactSensitive({
        name: error.name,
        message: error.message,
        statusCode: maybeError.status,
        code: maybeError.code,
        response: maybeError.response,
      });
    }

    return this.redactSensitive({ message: String(error) });
  }

  private redactSensitive(value: unknown): Record<string, unknown> {
    return this.redact(value) as Record<string, unknown>;
  }

  private redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (value instanceof Date) return value.toISOString();
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

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
