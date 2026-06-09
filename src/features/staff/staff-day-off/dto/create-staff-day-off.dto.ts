import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateStaffDayOffDto {
  @ApiProperty({ example: '2026-07-01', description: 'Ngày nghỉ (ISO date)' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: '09:00', description: 'Giờ bắt đầu nghỉ — null = nghỉ cả ngày' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'startTime phải có dạng HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ example: '13:00', description: 'Giờ kết thúc nghỉ — null = nghỉ cả ngày' })
  @ValidateIf((o) => o.startTime !== undefined)
  @Matches(TIME_REGEX, { message: 'endTime phải có dạng HH:mm' })
  endTime?: string;

  @ApiPropertyOptional({ example: 'Nghỉ phép năm', description: 'Lý do nghỉ' })
  @IsOptional()
  @IsString()
  reason?: string;
}
