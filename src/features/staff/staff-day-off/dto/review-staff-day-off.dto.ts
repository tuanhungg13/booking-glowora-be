import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum DayOffReviewAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class ReviewStaffDayOffDto {
  @ApiProperty({ enum: DayOffReviewAction, description: 'APPROVE hoặc REJECT' })
  @IsEnum(DayOffReviewAction)
  action!: DayOffReviewAction;

  @ApiPropertyOptional({ example: 'Không đủ nhân sự ngày đó', description: 'Ghi chú từ người duyệt' })
  @IsOptional()
  @IsString()
  note?: string;
}
