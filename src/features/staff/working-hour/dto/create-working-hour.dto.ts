import { IsBoolean, IsEnum, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class CreateWorkingHourDto {
  @IsUUID()
  shopId!: string;

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
