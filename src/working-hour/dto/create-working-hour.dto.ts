import { IsBoolean, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class CreateWorkingHourDto {
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsDateString()
  openTime!: string;

  @IsDateString()
  closeTime!: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}
