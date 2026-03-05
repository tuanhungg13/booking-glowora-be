import { Module } from '@nestjs/common';
import { StaffScheduleModule } from './staff/staff-schedule/staff-schedule.module';
import { StaffDayOffModule } from './staff/staff-day-off/staff-day-off.module';
import { WorkingHourModule } from './staff/working-hour/working-hour.module';

/**
 * Feature: Staff & Scheduling
 * - StaffSchedule (ca làm việc theo ngày)
 * - StaffDayOff (ngày nghỉ)
 * - WorkingHour (giờ làm việc mặc định)
 */
@Module({
  imports: [
    StaffScheduleModule,
    StaffDayOffModule,
    WorkingHourModule,
  ],
  exports: [
    StaffScheduleModule,
    StaffDayOffModule,
    WorkingHourModule,
  ],
})
export class StaffModule {}
