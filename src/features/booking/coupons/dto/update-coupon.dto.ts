import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, ValidateIf } from 'class-validator';

export class UpdateCouponDto {
  @ApiPropertyOptional({ description: 'Bật/tắt coupon', example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Gia hạn ngày hết hạn (ISO 8601). Bỏ field = giữ nguyên. Gửi null = xoá hạn (không giới hạn).',
    example: '2026-12-31T23:59:59.000Z',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  expiredAt?: string | null;
}
