import { Module } from '@nestjs/common';
import { WorkingHourService } from './working-hour.service';
import { WorkingHourController } from './working-hour.controller';

@Module({
  controllers: [WorkingHourController],
  providers: [WorkingHourService],
  exports: [WorkingHourService],
})
export class WorkingHourModule {}
