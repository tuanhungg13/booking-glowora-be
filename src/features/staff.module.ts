import { Module } from '@nestjs/common';
import { StaffScheduleModule } from './staff/staff-schedule/staff-schedule.module';
import { StaffDayOffModule } from './staff/staff-day-off/staff-day-off.module';
import { WorkingHourModule } from './staff/working-hour/working-hour.module';
import { StaffCallInModule } from './staff/staff-call-in/staff-call-in.module';

@Module({
  imports: [
    StaffScheduleModule,
    StaffDayOffModule,
    WorkingHourModule,
    StaffCallInModule,
  ],
  exports: [
    StaffScheduleModule,
    StaffDayOffModule,
    WorkingHourModule,
    StaffCallInModule,
  ],
})
export class StaffModule {}
