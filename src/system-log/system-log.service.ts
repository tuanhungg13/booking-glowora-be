import { Injectable } from '@nestjs/common';
import { LogType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LogData {
  type: LogType;
  actorId?: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export interface SystemLogFilter {
  type?: LogType;
  actorId?: string;
  q?: string;
  targetType?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class SystemLogService {
  constructor(private readonly prisma: PrismaService) {}

  log(data: LogData): void {
    this.prisma.systemLog.create({
      data: data as Prisma.SystemLogUncheckedCreateInput,
    }).catch(() => {});
  }

  async findAll(filter: SystemLogFilter) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const createdAt: Prisma.DateTimeFilter = {};
    if (filter.dateFrom) createdAt.gte = new Date(filter.dateFrom);
    if (filter.dateTo) {
      const to = new Date(filter.dateTo);
      to.setHours(23, 59, 59, 999);
      createdAt.lte = to;
    }

    const where: Prisma.SystemLogWhereInput = {
      ...(filter.type && { type: filter.type }),
      ...(filter.actorId && { actorId: filter.actorId }),
      ...(filter.targetId && { targetId: filter.targetId }),
      ...(filter.targetType && { targetType: filter.targetType }),
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
}
