import { Module } from '@nestjs/common';
import { StaffDayOffService } from './staff-day-off.service';
import { StaffDayOffController } from './staff-day-off.controller';

@Module({
  controllers: [StaffDayOffController],
  providers: [StaffDayOffService],
  exports: [StaffDayOffService],
})
export class StaffDayOffModule {}
