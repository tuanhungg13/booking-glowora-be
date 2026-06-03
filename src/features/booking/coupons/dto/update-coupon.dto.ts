import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class UpdateCouponDto {
  @ApiPropertyOptional({ description: 'Bật/tắt coupon', example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Gia hạn ngày hết hạn (ISO 8601)', example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiredAt?: string;
}
