import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CalendarQueryDto {
  @ApiProperty({ description: 'Tháng cần xem lịch (định dạng YYYY-MM)', example: '2026-06', pattern: '^\\d{4}-\\d{2}$' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month phải có định dạng YYYY-MM' })
  month!: string;

  @ApiPropertyOptional({ enum: BookingStatus, description: 'Lọc theo trạng thái lịch hẹn' })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'Lọc theo ID nhân viên', example: 'uuid-staff-id' })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
