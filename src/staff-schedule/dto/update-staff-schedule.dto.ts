import { IsBoolean, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class UpdateStaffScheduleDto {
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
