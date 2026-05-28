import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
  @ApiPropertyOptional({ description: 'Lý do hủy lịch hẹn', maxLength: 500, example: 'Có việc đột xuất' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
