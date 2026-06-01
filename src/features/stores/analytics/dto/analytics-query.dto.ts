import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyticsQueryDto {
  @ApiProperty({ example: '2026-05-01', description: 'Ngày bắt đầu (ISO date)' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-05-31', description: 'Ngày kết thúc (ISO date)' })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month'], default: 'day' })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month' = 'day';
}

export class TopServicesQueryDto {
  @ApiProperty({ example: '2026-05-01' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-05-31' })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
