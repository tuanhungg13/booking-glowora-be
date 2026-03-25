import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import { CreateStaffScheduleDto } from './dto/create-staff-schedule.dto';
import { UpdateStaffScheduleDto } from './dto/update-staff-schedule.dto';

@Injectable()
export class StaffScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStaffScheduleDto) {
    return this.prisma.staffSchedule.create({
      data: {
        shopId: dto.shopId,
        staffId: dto.staffId,
        dayOfWeek: dto.dayOfWeek,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        isActive: dto.isActive ?? true,
      },
      include: { staff: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async findAll(params?: { shopId?: string; staffId?: string; dayOfWeek?: DayOfWeek }) {
    return this.prisma.staffSchedule.findMany({
      where: {
        ...(params?.shopId && { shopId: params.shopId }),
        ...(params?.staffId && { staffId: params.staffId }),
        ...(params?.dayOfWeek && { dayOfWeek: params.dayOfWeek }),
      },
      orderBy: [{ staffId: 'asc' }, { dayOfWeek: 'asc' }],
      include: { staff: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.staffSchedule.findUnique({
      where: { id },
      include: { staff: { select: { id: true, fullName: true, email: true, phone: true } } },
    });
    if (!schedule) throw new NotFoundException('Staff schedule not found');
    return schedule;
  }

  async update(id: string, dto: UpdateStaffScheduleDto) {
    await this.findOne(id);
    return this.prisma.staffSchedule.update({
      where: { id },
      data: {
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        isActive: dto.isActive,
      },
      include: { staff: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.staffSchedule.delete({ where: { id } });
    return { deleted: true };
  }
}
