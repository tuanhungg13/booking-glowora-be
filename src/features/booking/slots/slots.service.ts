import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, DayOfWeek, ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AvailableSlotsQueryDto } from './dto/available-slots-query.dto';

// minutes offset from UTC for common timezones
const TZ_OFFSETS: Record<string, number> = {
  'Asia/Ho_Chi_Minh': 7 * 60,
  'Asia/Bangkok': 7 * 60,
  'Asia/Saigon': 7 * 60,
  'Asia/Jakarta': 7 * 60,
  'Asia/Singapore': 8 * 60,
  'Asia/Kuala_Lumpur': 8 * 60,
  UTC: 0,
};

const DOW_MAP: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

// Buffer: don't allow booking slots that start within 30 minutes of now
const BOOKING_BUFFER_MINS = 30;

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailableSlots(storeId: string, dto: AvailableSlotsQueryDto) {
    const { date, serviceId, variantId, staffId } = dto;

    const [store, variant] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId } }),
      this.prisma.serviceVariant.findFirst({
        where: { id: variantId, serviceId, status: ServiceStatus.ACTIVE, service: { shopId: storeId, status: ServiceStatus.ACTIVE } },
      }),
    ]);

    if (!store || store.status !== StoreStatus.ACTIVE) {
      throw new NotFoundException('Store not found or inactive');
    }
    if (!variant) throw new NotFoundException('Service variant not found for this store');

    const tzOffset = TZ_OFFSETS[store.timezone] ?? 7 * 60;
    const todayStr = this.getTodayDateStr(tzOffset);

    if (date < todayStr) throw new BadRequestException('Ngày đã qua');
    if (store.maxAdvanceDays > 0) {
      const maxDate = this.addDays(todayStr, store.maxAdvanceDays);
      if (date > maxDate) {
        throw new BadRequestException(`Vượt quá ${store.maxAdvanceDays} ngày đặt trước tối đa`);
      }
    }

    const dayOfWeek = this.getDayOfWeek(date);
    const workingHour = await this.prisma.workingHour.findFirst({
      where: { storeId, dayOfWeek },
    });
    if (!workingHour || workingHour.isClosed) {
      return this.emptyResult(date, serviceId, variantId, variant.duration, store.slotIntervalMins);
    }

    const shopOpenMins = this.parseTime(workingHour.openTime);
    const shopCloseMins = this.parseTime(workingHour.closeTime);

    // Determine qualified staff list
    let qualifiedStaffIds: string[];
    if (staffId) {
      const staffRecord = await this.prisma.staff.findFirst({
        where: { id: staffId, storeId, status: 'ACTIVE' },
      });
      if (!staffRecord) throw new NotFoundException('Staff not found in this store');
      const canDoService = await this.prisma.staffService.findFirst({ where: { staffId, serviceId } });
      if (!canDoService) throw new BadRequestException('Nhân viên không thực hiện dịch vụ này');
      qualifiedStaffIds = [staffId];
    } else {
      const mappings = await this.prisma.staffService.findMany({
        where: { serviceId, staff: { storeId, status: 'ACTIVE' } },
        select: { staffId: true },
      });
      qualifiedStaffIds = mappings.map((m) => m.staffId);
      if (!qualifiedStaffIds.length) {
        return this.emptyResult(date, serviceId, variantId, variant.duration, store.slotIntervalMins);
      }
    }

    const { start: dayStart, end: dayEnd } = this.getDayBoundsUTC(date, tzOffset);
    const isToday = date === todayStr;
    const nowLocalMins = isToday ? this.getNowLocalMins(tzOffset) : -1;

    // Use UTC midnight for @db.Date comparison
    const dateUTCMidnight = new Date(`${date}T00:00:00.000Z`);

    const staffSlots: {
      staffId: string;
      staffName: string;
      avatarUrl: string | null;
      availableSlots: string[];
    }[] = [];

    for (const sid of qualifiedStaffIds) {
      const schedule = await this.prisma.staffSchedule.findFirst({
        where: { staffId: sid, dayOfWeek, isActive: true },
      });
      if (!schedule) continue;

      const dayOff = await this.prisma.staffDayOff.findFirst({
        where: { staffId: sid, date: dateUTCMidnight },
      });
      if (dayOff) continue;

      const windowStart = Math.max(shopOpenMins, this.parseTime(schedule.startTime));
      const windowEnd = Math.min(shopCloseMins, this.parseTime(schedule.endTime));
      if (windowStart >= windowEnd) continue;

      // Generate candidate slots
      const candidates: number[] = [];
      for (let cur = windowStart; cur + variant.duration <= windowEnd; cur += store.slotIntervalMins) {
        candidates.push(cur);
      }

      // Load busy appointments for this staff on this day
      const busyApts = await this.prisma.appointment.findMany({
        where: {
          staffId: sid,
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
          scheduledAt: { gte: dayStart, lte: dayEnd },
        },
        select: { scheduledAt: true, duration: true },
      });

      const available = candidates.filter((slotMins) => {
        // Drop slots too close to now
        if (isToday && slotMins <= nowLocalMins + BOOKING_BUFFER_MINS) return false;

        const slotEnd = slotMins + variant.duration;
        return !busyApts.some((apt) => {
          const aptStart = this.getLocalMinsFromUTC(apt.scheduledAt, tzOffset);
          const aptEnd = aptStart + apt.duration;
          return slotMins < aptEnd && aptStart < slotEnd;
        });
      });

      if (!available.length) continue;

      const staffRecord = await this.prisma.staff.findUnique({
        where: { id: sid },
        include: { user: { select: { fullName: true, avatarUrl: true } } },
      });
      if (!staffRecord) continue;

      staffSlots.push({
        staffId: sid,
        staffName: staffRecord.user.fullName,
        avatarUrl: staffRecord.user.avatarUrl,
        availableSlots: available.map((m) => this.formatMinutes(m)),
      });
    }

    return {
      date,
      serviceId,
      variantId,
      serviceDuration: variant.duration,
      slotIntervalMins: store.slotIntervalMins,
      staffSlots,
    };
  }

  private emptyResult(date: string, serviceId: string, variantId: string, serviceDuration: number, slotIntervalMins: number) {
    return { date, serviceId, variantId, serviceDuration, slotIntervalMins, staffSlots: [] };
  }

  private getTodayDateStr(tzOffsetMins: number): string {
    const d = new Date(Date.now() + tzOffsetMins * 60 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const result = new Date(Date.UTC(y, m - 1, d + days));
    const ry = result.getUTCFullYear();
    const rm = String(result.getUTCMonth() + 1).padStart(2, '0');
    const rd = String(result.getUTCDate()).padStart(2, '0');
    return `${ry}-${rm}-${rd}`;
  }

  private getDayOfWeek(dateStr: string): DayOfWeek {
    const [y, m, d] = dateStr.split('-').map(Number);
    const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return DOW_MAP[jsDay];
  }

  private getDayBoundsUTC(dateStr: string, tzOffsetMins: number): { start: Date; end: Date } {
    const [y, m, d] = dateStr.split('-').map(Number);
    const offsetMs = tzOffsetMins * 60 * 1000;
    return {
      start: new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs),
      end: new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offsetMs),
    };
  }

  private parseTime(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  private getNowLocalMins(tzOffsetMins: number): number {
    const d = new Date(Date.now() + tzOffsetMins * 60 * 1000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  private getLocalMinsFromUTC(utcDate: Date, tzOffsetMins: number): number {
    const d = new Date(utcDate.getTime() + tzOffsetMins * 60 * 1000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  private formatMinutes(mins: number): string {
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
}
