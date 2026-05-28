import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CalendarQueryDto {
  @ApiProperty({ description: 'Tháng cần xem lịch (định dạng YYYY-MM)', example: '2026-06', pattern: '^\\d{4}-\\d{2}$' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month phải có định dạng YYYY-MM' })
  month!: string;
}
