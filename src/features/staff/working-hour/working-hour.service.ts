import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import { CreateWorkingHourDto } from './dto/create-working-hour.dto';
import { UpdateWorkingHourDto } from './dto/update-working-hour.dto';

@Injectable()
export class WorkingHourService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWorkingHourDto) {
    return this.prisma.workingHour.create({
      data: {
        shopId: dto.shopId,
        dayOfWeek: dto.dayOfWeek,
        openTime: new Date(dto.openTime),
        closeTime: new Date(dto.closeTime),
        isClosed: dto.isClosed ?? false,
      },
    });
  }

  async findAll(params?: { shopId?: string; dayOfWeek?: DayOfWeek }) {
    return this.prisma.workingHour.findMany({
      where: {
        ...(params?.shopId && { shopId: params.shopId }),
        ...(params?.dayOfWeek && { dayOfWeek: params.dayOfWeek }),
      },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async findOne(id: string) {
    const wh = await this.prisma.workingHour.findUnique({
      where: { id },
    });
    if (!wh) throw new NotFoundException('Working hour not found');
    return wh;
  }

  async update(id: string, dto: UpdateWorkingHourDto) {
    await this.findOne(id);
    return this.prisma.workingHour.update({
      where: { id },
      data: {
        dayOfWeek: dto.dayOfWeek,
        openTime: dto.openTime ? new Date(dto.openTime) : undefined,
        closeTime: dto.closeTime ? new Date(dto.closeTime) : undefined,
        isClosed: dto.isClosed,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.workingHour.delete({ where: { id } });
    return { deleted: true };
  }
}
