import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateStaffDayOffDto {
  @ApiPropertyOptional({ example: '2026-07-01', description: 'Ngày nghỉ (ISO date)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: 'Nghỉ phép năm', description: 'Lý do nghỉ' })
  @IsOptional()
  @IsString()
  reason?: string;
}
