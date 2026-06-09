import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateStaffCallInDto {
  @ApiProperty({ example: '2026-07-15', description: 'Ngày gọi đi làm (ISO date)' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: '09:00', description: 'Giờ bắt đầu (HH:mm)' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'startTime phải có dạng HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ example: '17:00', description: 'Giờ kết thúc (HH:mm)' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'endTime phải có dạng HH:mm' })
  endTime?: string;

  @ApiPropertyOptional({ example: 'Shop đông khách, cần thêm người', description: 'Ghi chú từ quản lý' })
  @IsOptional()
  @IsString()
  note?: string;
}
