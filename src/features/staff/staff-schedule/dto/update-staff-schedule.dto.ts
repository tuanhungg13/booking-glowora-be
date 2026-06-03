import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class UpdateStaffScheduleDto {
  @ApiPropertyOptional({ enum: DayOfWeek, example: DayOfWeek.MONDAY })
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiPropertyOptional({ example: '08:00', description: 'Giờ bắt đầu (HH:MM)' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '17:00', description: 'Giờ kết thúc (HH:MM)' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ example: true, description: 'Ca làm việc có hiệu lực không' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
