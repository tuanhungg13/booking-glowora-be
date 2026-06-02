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
    await this.assertStaffInStore(storeId, staffId);
    return this.prisma.staffSchedule.create({
      data: {
        storeId,
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
    await this.assertStaffInStore(storeId, staffId);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffSchedule.deleteMany({ where: { storeId, staffId } });
      if (schedules.length) {
        await tx.staffSchedule.createMany({
          data: schedules.map((s) => ({
            storeId,
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
      where: { storeId, staffId },
      orderBy: { dayOfWeek: 'asc' },
      include: scheduleInclude,
    });
  }

  async findAll(storeId: string, staffId: string, dayOfWeek?: DayOfWeek) {
    return this.prisma.staffSchedule.findMany({
      where: {
        storeId,
        staffId,
        ...(dayOfWeek && { dayOfWeek }),
      },
      orderBy: { dayOfWeek: 'asc' },
      include: scheduleInclude,
    });
  }

  async findOne(id: string, storeId?: string, staffId?: string) {
    const schedule = await this.prisma.staffSchedule.findFirst({
      where: {
        id,
        ...(storeId && { storeId }),
        ...(staffId && { staffId }),
      },
      include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } } },
    });
    if (!schedule) throw new NotFoundException('Staff schedule not found');
    return schedule;
  }

  async update(id: string, storeId: string, staffId: string, dto: UpdateStaffScheduleDto) {
    await this.findOne(id, storeId, staffId);
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

  async remove(id: string, storeId: string, staffId: string) {
    await this.findOne(id, storeId, staffId);
    await this.prisma.staffSchedule.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertStaffInStore(storeId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, storeId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found in this store');
  }
}
