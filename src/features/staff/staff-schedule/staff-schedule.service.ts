import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import { CreateStaffScheduleDto } from './dto/create-staff-schedule.dto';
import { UpdateStaffScheduleDto } from './dto/update-staff-schedule.dto';

const scheduleInclude = {
  staff: { include: { user: { select: { id: true, fullName: true, email: true } } } },
} as const;

const historyInclude = {
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

  async bulkUpsert(storeId: string, staffId: string, schedules: CreateStaffScheduleDto[], changedBy?: string) {
    await this.assertStaffInStore(storeId, staffId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Lưu lịch hiện tại vào history trước khi xóa
      const current = await tx.staffSchedule.findMany({ where: { storeId, staffId } });
      if (current.length > 0) {
        await tx.staffScheduleHistory.createMany({
          data: current.map((s) => ({
            storeId: s.storeId,
            staffId: s.staffId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isActive: s.isActive,
            effectiveFrom: s.createdAt,
            effectiveTo: now,
            changedBy: changedBy ?? null,
          })),
        });
      }

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

  async findAll(storeId: string, staffId: string, dayOfWeek?: DayOfWeek, date?: string) {
    if (date) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (date < todayStr) {
        const targetDate = new Date(`${date}T00:00:00.000Z`);

        // Bước 1: tìm phiên bản lịch đã bị thay thế đúng vào ngày đó
        const historyRecords = await this.prisma.staffScheduleHistory.findMany({
          where: {
            storeId,
            staffId,
            effectiveFrom: { lte: targetDate },
            effectiveTo: { gt: targetDate },
            ...(dayOfWeek && { dayOfWeek }),
          },
          orderBy: { dayOfWeek: 'asc' },
          include: historyInclude,
        });
        if (historyRecords.length > 0) return historyRecords;

        // Bước 2: lịch hiện tại vẫn chưa từng thay đổi, kiểm tra nó đã tồn tại trước date chưa
        return this.prisma.staffSchedule.findMany({
          where: {
            storeId,
            staffId,
            createdAt: { lte: targetDate },
            ...(dayOfWeek && { dayOfWeek }),
          },
          orderBy: { dayOfWeek: 'asc' },
          include: scheduleInclude,
        });
      }
    }
    // Hiện tại hoặc tương lai → lấy lịch đang áp dụng
    return this.prisma.staffSchedule.findMany({
      where: { storeId, staffId, ...(dayOfWeek && { dayOfWeek }) },
      orderBy: { dayOfWeek: 'asc' },
      include: scheduleInclude,
    });
  }

  async findOne(id: string, storeId?: string, staffId?: string) {
    const schedule = await this.prisma.staffSchedule.findFirst({
      where: { id, ...(storeId && { storeId }), ...(staffId && { staffId }) },
      include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } } },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy lịch làm việc');
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

  async findHistory(storeId: string, staffId: string, params?: { from?: Date; to?: Date }) {
    await this.assertStaffInStore(storeId, staffId);
    return this.prisma.staffScheduleHistory.findMany({
      where: {
        storeId,
        staffId,
        ...(params?.from || params?.to
          ? { effectiveTo: { ...(params.from && { gte: params.from }), ...(params.to && { lte: params.to }) } }
          : {}),
      },
      orderBy: { effectiveTo: 'desc' },
    });
  }

  private async assertStaffInStore(storeId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, storeId }, select: { id: true } });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên trong cửa hàng này');
  }
}
