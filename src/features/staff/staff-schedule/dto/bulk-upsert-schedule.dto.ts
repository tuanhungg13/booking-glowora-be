import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateStaffScheduleDto } from './create-staff-schedule.dto';

export class BulkUpsertScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStaffScheduleDto)
  schedules!: CreateStaffScheduleDto[];
}
