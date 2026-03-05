import { IsBoolean, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class UpdateWorkingHourDto {
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @IsOptional()
  @IsDateString()
  openTime?: string;

  @IsOptional()
  @IsDateString()
  closeTime?: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}
