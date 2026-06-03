import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class UpdateWorkingHourDto {
  @ApiPropertyOptional({ enum: DayOfWeek, description: 'Ngày trong tuần' })
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiPropertyOptional({ example: '09:00', description: 'Giờ mở cửa (HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'openTime must be in HH:MM format' })
  openTime?: string;

  @ApiPropertyOptional({ example: '21:00', description: 'Giờ đóng cửa (HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closeTime must be in HH:MM format' })
  closeTime?: string;

  @ApiPropertyOptional({ example: false, description: 'Đóng cửa cả ngày' })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}
