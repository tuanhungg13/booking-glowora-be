import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class CreateWorkingHourDto {
  storeId!: string; // set by controller from x-store-id header, not from request body

  @ApiProperty({ enum: DayOfWeek, example: DayOfWeek.MONDAY, description: 'Ngày trong tuần' })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '08:00', description: 'Giờ mở cửa (HH:MM)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'openTime must be in HH:MM format' })
  openTime!: string;

  @ApiProperty({ example: '20:00', description: 'Giờ đóng cửa (HH:MM)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closeTime must be in HH:MM format' })
  closeTime!: string;

  @ApiPropertyOptional({ example: false, description: 'Đóng cửa cả ngày' })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}
