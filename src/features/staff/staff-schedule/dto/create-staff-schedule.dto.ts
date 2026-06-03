import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class CreateStaffScheduleDto {
  @ApiProperty({ enum: DayOfWeek, example: DayOfWeek.MONDAY })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '08:00', description: 'Giờ bắt đầu (HH:MM)' })
  @IsString()
  startTime!: string;

  @ApiProperty({ example: '17:00', description: 'Giờ kết thúc (HH:MM)' })
  @IsString()
  endTime!: string;

  @ApiPropertyOptional({ example: true, default: true, description: 'Ca làm việc có hiệu lực không' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
