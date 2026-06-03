import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateStaffScheduleDto } from './create-staff-schedule.dto';

export class BulkUpsertScheduleDto {
  @ApiProperty({ type: [CreateStaffScheduleDto], description: 'Danh sách ca làm việc — ghi đè toàn bộ lịch cũ' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStaffScheduleDto)
  schedules!: CreateStaffScheduleDto[];
}
