import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, DayOfWeek, ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AvailableSlotsDto } from './dto/available-slots-query.dto';

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

type StaffInfo = {
  windowStart: number;
  windowEnd: number;
  busyWindows: Array<{ start: number; end: number }>;
};

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailableSlots(storeId: string, dto: AvailableSlotsDto) {
    const { date, services } = dto;

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.status !== StoreStatus.ACTIVE) {
      throw new NotFoundException('Store not found or inactive');
    }

    // Fix 4: Guard — tránh vòng lặp vô hạn nếu store config sai
    if (store.slotIntervalMins <= 0) {
      throw new BadRequestException('Cấu hình store không hợp lệ: slotIntervalMins phải > 0');
    }

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
    const workingHour = await this.prisma.workingHour.findFirst({ where: { storeId, dayOfWeek } });
    if (!workingHour || workingHour.isClosed) {
      return { date, totalDuration: 0, services: [], availableSlots: [] };
    }

    const storeOpenMins = this.parseTime(workingHour.openTime);
    const storeCloseMins = this.parseTime(workingHour.closeTime);

    // Fix 2: Query tất cả variant song song thay vì tuần tự
    const variantResults = await Promise.all(
      services.map((svc) =>
        this.prisma.serviceVariant.findFirst({
          where: {
            id: svc.variantId,
            serviceId: svc.serviceId,
            status: ServiceStatus.ACTIVE,
            service: { storeId, status: ServiceStatus.ACTIVE },
          },
        }),
      ),
    );

    const serviceDetails: Array<{
      serviceId: string;
      variantId: string;
      staffId?: string;
      duration: number;
    }> = [];

    for (let i = 0; i < variantResults.length; i++) {
      if (!variantResults[i]) {
        throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);
      }
      serviceDetails.push({
        serviceId: services[i].serviceId,
        variantId: services[i].variantId,
        staffId: services[i].staffId,
        duration: variantResults[i]!.duration,
      });
    }

    const totalDuration = serviceDetails.reduce((sum, s) => sum + s.duration, 0);

    // Fix 4: Guard — tránh vòng lặp vô hạn nếu tất cả variant có duration = 0
    if (totalDuration <= 0) {
      throw new BadRequestException('Tổng thời gian dịch vụ không hợp lệ');
    }

    // Fix 3: Query staff hợp lệ cho mỗi service song song
    const serviceQualifiedStaff: string[][] = await Promise.all(
      serviceDetails.map(async (svc, i) => {
        if (svc.staffId) {
          const [staffRecord, canDo] = await Promise.all([
            this.prisma.staff.findFirst({ where: { id: svc.staffId, storeId, status: 'ACTIVE' } }),
            this.prisma.staffService.findFirst({ where: { staffId: svc.staffId, serviceId: svc.serviceId } }),
          ]);
          if (!staffRecord) throw new NotFoundException(`Nhân viên không tìm thấy (dịch vụ ${i + 1})`);
          if (!canDo) throw new BadRequestException(`Nhân viên không thực hiện được dịch vụ ${i + 1}`);
          return [svc.staffId];
        }
        const mappings = await this.prisma.staffService.findMany({
          where: { serviceId: svc.serviceId, staff: { storeId, status: 'ACTIVE' } },
          select: { staffId: true },
        });
        return mappings.map((m) => m.staffId);
      }),
    );

    // Fix 1: Thay N+1 query bằng 4 batch query song song
    const allStaffIds = [...new Set(serviceQualifiedStaff.flat())];
    const { start: dayStart, end: dayEnd } = this.getDayBoundsUTC(date, tzOffset);
    const isToday = date === todayStr;
    const nowLocalMins = isToday ? this.getNowLocalMins(tzOffset) : -1;
    const dateUTCMidnight = new Date(`${date}T00:00:00.000Z`);

    const [schedules, dayOffs, busyItems, staffRecords] = await Promise.all([
      this.prisma.staffSchedule.findMany({
        where: { staffId: { in: allStaffIds }, dayOfWeek, isActive: true },
      }),
      this.prisma.staffDayOff.findMany({
        where: { staffId: { in: allStaffIds }, date: dateUTCMidnight },
      }),
      this.prisma.bookingItem.findMany({
        where: {
          staffId: { in: allStaffIds },
          booking: { status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] } },
          startTime: { gte: dayStart, lte: dayEnd },
        },
        select: { staffId: true, startTime: true, duration: true },
      }),
      this.prisma.staff.findMany({
        where: { id: { in: allStaffIds } },
        include: { user: { select: { fullName: true, avatarUrl: true } } },
      }),
    ]);

    const scheduleMap = new Map(schedules.map((s) => [s.staffId, s]));
    const dayOffSet = new Set(dayOffs.map((d) => d.staffId));

    const busyMap = new Map<string, Array<{ start: number; end: number }>>();
    for (const item of busyItems) {
      const start = this.getLocalMinsFromUTC(item.startTime, tzOffset);
      const list = busyMap.get(item.staffId!) ?? [];
      list.push({ start, end: start + item.duration });
      busyMap.set(item.staffId!, list);
    }

    const staffInfoMap = new Map<string, StaffInfo | null>();
    const staffNameMap = new Map<string, { fullName: string; avatarUrl: string | null }>();

    for (const staffId of allStaffIds) {
      const schedule = scheduleMap.get(staffId);
      if (!schedule || dayOffSet.has(staffId)) {
        staffInfoMap.set(staffId, null);
        continue;
      }

      const windowStart = Math.max(storeOpenMins, this.parseTime(schedule.startTime));
      const windowEnd = Math.min(storeCloseMins, this.parseTime(schedule.endTime));
      if (windowStart >= windowEnd) {
        staffInfoMap.set(staffId, null);
        continue;
      }

      staffInfoMap.set(staffId, {
        windowStart,
        windowEnd,
        busyWindows: busyMap.get(staffId) ?? [],
      });
    }

    for (const record of staffRecords) {
      staffNameMap.set(record.id, { fullName: record.user.fullName, avatarUrl: record.user.avatarUrl });
    }

    // Fix 6: Sắp xếp staff theo workload tăng dần để cân bằng tải
    const sortedServiceQualifiedStaff = serviceQualifiedStaff.map((qualified) =>
      qualified
        .filter((id) => staffInfoMap.get(id) !== null)
        .sort((a, b) => {
          const aLoad = staffInfoMap.get(a)?.busyWindows.length ?? 999;
          const bLoad = staffInfoMap.get(b)?.busyWindows.length ?? 999;
          return aLoad - bLoad;
        }),
    );

    // Generate candidate slots
    type SlotAssignment = {
      sortOrder: number;
      serviceId: string;
      variantId: string;
      staffId: string;
      staffName: string;
      avatarUrl: string | null;
      from: string;
      to: string;
    };

    const availableSlots: Array<{ startTime: string; assignments: SlotAssignment[] }> = [];

    // Fix 5: Dùng store.bookingBufferMins thay vì hardcode
    for (let slotMins = storeOpenMins; slotMins + totalDuration <= storeCloseMins; slotMins += store.slotIntervalMins) {
      if (isToday && slotMins <= nowLocalMins + store.bookingBufferMins) continue;

      let currentMins = slotMins;
      const assignments: SlotAssignment[] = [];
      const intraBookingWindows = new Map<string, Array<{ start: number; end: number }>>();
      let slotValid = true;

      for (let i = 0; i < serviceDetails.length; i++) {
        const svc = serviceDetails[i];
        const svcStart = currentMins;
        const svcEnd = currentMins + svc.duration;
        const qualified = sortedServiceQualifiedStaff[i];
        let assigned = false;

        for (const staffId of qualified) {
          const info = staffInfoMap.get(staffId);
          if (!info) continue;

          if (svcStart < info.windowStart || svcEnd > info.windowEnd) continue;

          const existingOverlap = info.busyWindows.some((w) => svcStart < w.end && w.start < svcEnd);
          if (existingOverlap) continue;

          const intraWindows = intraBookingWindows.get(staffId) ?? [];
          const intraOverlap = intraWindows.some((w) => svcStart < w.end && w.start < svcEnd);
          if (intraOverlap) continue;

          const nameInfo = staffNameMap.get(staffId);
          assignments.push({
            sortOrder: i,
            serviceId: svc.serviceId,
            variantId: svc.variantId,
            staffId,
            staffName: nameInfo?.fullName ?? '',
            avatarUrl: nameInfo?.avatarUrl ?? null,
            from: this.formatMinutes(svcStart),
            to: this.formatMinutes(svcEnd),
          });
          intraBookingWindows.set(staffId, [...intraWindows, { start: svcStart, end: svcEnd }]);
          assigned = true;
          break;
        }

        if (!assigned) { slotValid = false; break; }
        currentMins = svcEnd;
      }

      if (slotValid) {
        availableSlots.push({ startTime: this.formatMinutes(slotMins), assignments });
      }
    }

    return {
      date,
      totalDuration,
      services: serviceDetails.map((s, i) => ({
        sortOrder: i,
        serviceId: s.serviceId,
        variantId: s.variantId,
        duration: s.duration,
      })),
      availableSlots,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

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
    return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
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
