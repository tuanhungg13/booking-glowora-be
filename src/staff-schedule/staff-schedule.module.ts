import { Module } from '@nestjs/common';
import { StaffScheduleService } from './staff-schedule.service';
import { StaffScheduleController } from './staff-schedule.controller';

@Module({
  controllers: [StaffScheduleController],
  providers: [StaffScheduleService],
  exports: [StaffScheduleService],
})
export class StaffScheduleModule {}
