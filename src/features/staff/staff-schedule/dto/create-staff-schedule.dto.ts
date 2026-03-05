import { IsBoolean, IsEnum, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class CreateStaffScheduleDto {
  @IsUUID()
  staffId!: string;

  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
