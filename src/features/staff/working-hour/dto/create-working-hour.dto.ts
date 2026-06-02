import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class CreateWorkingHourDto {
  @IsUUID()
  storeId!: string;

  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'openTime must be in HH:MM format' })
  openTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closeTime must be in HH:MM format' })
  closeTime!: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}
