import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, CallInStatus, DayOfWeek, DayOffStatus, ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AvailableSlotsDto } from './dto/available-slots-query.dto';
import { AvailableStaffQueryDto } from './dto/available-staff-query.dto';

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
      throw new NotFoundException('Cửa hàng không tồn tại hoặc chưa hoạt động');
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
          const staffRecord = await this.prisma.staff.findFirst({
            where: { id: svc.staffId, storeId, status: 'ACTIVE' },
          });
          if (!staffRecord) throw new NotFoundException(`Nhân viên không tìm thấy (dịch vụ ${i + 1})`);
          return [svc.staffId];
        }
        const qualified = await this.prisma.staff.findMany({
          where: { storeId, status: 'ACTIVE' },
          select: { id: true },
        });
        return qualified.map((s) => s.id);
      }),
    );

    // Fix 1: Thay N+1 query bằng 4 batch query song song
    const allStaffIds = [...new Set(serviceQualifiedStaff.flat())];
    const { start: dayStart, end: dayEnd } = this.getDayBoundsUTC(date, tzOffset);
    const isToday = date === todayStr;
    const nowLocalMins = isToday ? this.getNowLocalMins(tzOffset) : -1;
    const dateUTCMidnight = new Date(`${date}T00:00:00.000Z`);

    const [schedules, dayOffs, callIns, busyItems, staffRecords] = await Promise.all([
      this.prisma.staffSchedule.findMany({
        where: { staffId: { in: allStaffIds }, dayOfWeek, isActive: true },
      }),
      this.prisma.staffDayOff.findMany({
        where: {
          staffId: { in: allStaffIds },
          date: dateUTCMidnight,
          status: { in: [DayOffStatus.PENDING, DayOffStatus.APPROVED] },
        },
        select: { staffId: true, startTime: true, endTime: true, status: true },
      }),
      this.prisma.staffCallIn.findMany({
        where: { staffId: { in: allStaffIds }, date: dateUTCMidnight, status: CallInStatus.ACCEPTED },
      }),
      this.prisma.bookingItem.findMany({
        where: {
          staffId: { in: allStaffIds },
          booking: {
            status: {
              in: [
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
                BookingStatus.DEPOSIT_PENDING,
                BookingStatus.DEPOSIT_PAID,
                BookingStatus.PAID,
              ],
            },
          },
          startTime: { gte: dayStart, lte: dayEnd },
        },
        select: { staffId: true, startTime: true, duration: true },
      }),
      this.prisma.staff.findMany({
        where: { id: { in: allStaffIds }, status: 'ACTIVE' },
        include: { user: { select: { fullName: true, avatarUrl: true } } },
      }),
    ]);

    const scheduleMap = new Map(schedules.map((s) => [s.staffId, s]));
    const dayOffMap = new Map(dayOffs.map((d) => [d.staffId, d]));
    const callInMap = new Map(callIns.map((c) => [c.staffId, c]));

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
      const callIn = callInMap.get(staffId);
      const dayOff = dayOffMap.get(staffId);

      // Loại nếu không có lịch tuần VÀ không có call-in accepted
      if (!schedule && !callIn) {
        staffInfoMap.set(staffId, null);
        continue;
      }

      // Loại nếu có ngày nghỉ cả ngày (startTime = null)
      if (dayOff && !dayOff.startTime) {
        staffInfoMap.set(staffId, null);
        continue;
      }

      // Giờ làm: ưu tiên schedule → fallback callIn → fallback store hours
      const startTimeStr = schedule?.startTime ?? callIn?.startTime ?? workingHour.openTime;
      const endTimeStr = schedule?.endTime ?? callIn?.endTime ?? workingHour.closeTime;
      const windowStart = Math.max(storeOpenMins, this.parseTime(startTimeStr));
      const windowEnd = Math.min(storeCloseMins, this.parseTime(endTimeStr));
      if (windowStart >= windowEnd) {
        staffInfoMap.set(staffId, null);
        continue;
      }

      // Nếu nghỉ nửa buổi → thêm vào busyWindows
      const existingBusy = busyMap.get(staffId) ?? [];
      const partialBusy = dayOff?.startTime && dayOff?.endTime
        ? [{ start: this.parseTime(dayOff.startTime), end: this.parseTime(dayOff.endTime) }]
        : [];

      staffInfoMap.set(staffId, {
        windowStart,
        windowEnd,
        busyWindows: [...existingBusy, ...partialBusy],
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

    for (let slotMins = storeOpenMins; slotMins + totalDuration <= storeCloseMins; slotMins += store.slotIntervalMins) {
      if (isToday && slotMins < nowLocalMins) continue;

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

  async getAvailableStaff(storeId: string, dto: AvailableStaffQueryDto) {
    const { date, services } = dto;

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.status !== StoreStatus.ACTIVE) {
      throw new NotFoundException('Cửa hàng không tồn tại hoặc chưa hoạt động');
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
      return { date, services: [] };
    }

    const dateUTCMidnight = new Date(`${date}T00:00:00.000Z`);

    const results = await Promise.all(
      services.map(async (svc, i) => {
        const variant = await this.prisma.serviceVariant.findFirst({
          where: {
            id: svc.variantId,
            serviceId: svc.serviceId,
            status: ServiceStatus.ACTIVE,
            service: { storeId, status: ServiceStatus.ACTIVE },
          },
          include: { service: { select: { name: true } } },
        });
        if (!variant) throw new NotFoundException(`Variant không tìm thấy cho dịch vụ thứ ${i + 1}`);

        const staffList = await this.prisma.staff.findMany({
          where: {
            storeId,
            status: 'ACTIVE',
            dayOffs: { none: { date: dateUTCMidnight, startTime: null, status: { in: [DayOffStatus.PENDING, DayOffStatus.APPROVED] } } },
            OR: [
              { schedules: { some: { dayOfWeek, isActive: true } } },
              { callIns: { some: { date: dateUTCMidnight, status: CallInStatus.ACCEPTED } } },
            ],
          },
          select: {
            id: true,
            rating: true,
            user: { select: { fullName: true, avatarUrl: true } },
          },
        });

        return {
          sortOrder: i,
          serviceId: svc.serviceId,
          variantId: svc.variantId,
          serviceName: variant.service.name,
          variantName: variant.name,
          duration: variant.duration,
          price: variant.price,
          availableStaff: staffList.map((s) => ({
            staffId: s.id,
            staffName: s.user.fullName,
            avatarUrl: s.user.avatarUrl,
            rating: Number(s.rating),
          })),
        };
      }),
    );

    return { date, services: results };
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
