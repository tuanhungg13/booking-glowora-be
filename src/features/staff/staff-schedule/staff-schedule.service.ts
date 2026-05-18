import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import { CreateStaffScheduleDto } from './dto/create-staff-schedule.dto';
import { UpdateStaffScheduleDto } from './dto/update-staff-schedule.dto';

const scheduleInclude = {
  staff: { include: { user: { select: { id: true, fullName: true, email: true } } } },
} as const;

@Injectable()
export class StaffScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, staffId: string, dto: CreateStaffScheduleDto) {
    return this.prisma.staffSchedule.create({
      data: {
        shopId: storeId,
        staffId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isActive: dto.isActive ?? true,
      },
      include: scheduleInclude,
    });
  }

  async bulkUpsert(storeId: string, staffId: string, schedules: CreateStaffScheduleDto[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.staffSchedule.deleteMany({ where: { shopId: storeId, staffId } });
      if (schedules.length) {
        await tx.staffSchedule.createMany({
          data: schedules.map((s) => ({
            shopId: storeId,
            staffId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isActive: s.isActive ?? true,
          })),
        });
      }
    });
    return this.prisma.staffSchedule.findMany({
      where: { shopId: storeId, staffId },
      orderBy: { dayOfWeek: 'asc' },
      include: scheduleInclude,
    });
  }

  async findAll(storeId: string, staffId: string, dayOfWeek?: DayOfWeek) {
    return this.prisma.staffSchedule.findMany({
      where: {
        shopId: storeId,
        staffId,
        ...(dayOfWeek && { dayOfWeek }),
      },
      orderBy: { dayOfWeek: 'asc' },
      include: scheduleInclude,
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.staffSchedule.findUnique({
      where: { id },
      include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } } },
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
        startTime: dto.startTime,
        endTime: dto.endTime,
        isActive: dto.isActive,
      },
      include: scheduleInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.staffSchedule.delete({ where: { id } });
    return { deleted: true };
  }
}
