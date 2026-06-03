import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CouponType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({ description: 'Mã coupon (chữ hoa + số, 4-20 ký tự)', example: 'SUMMER20' })
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @Matches(/^[A-Z0-9]+$/, { message: 'code chỉ được chứa chữ hoa và số' })
  code!: string;

  @ApiProperty({ enum: CouponType, description: 'Loại giảm giá: PERCENTAGE (%) hoặc FIXED (VND)' })
  @IsEnum(CouponType)
  type!: CouponType;

  @ApiProperty({ description: 'Giá trị giảm: % hoặc số tiền VND', example: 20 })
  @Type(() => Number)
  @IsPositive()
  value!: number;

  @ApiPropertyOptional({ description: 'Tổng tiền đặt tối thiểu để dùng coupon (VND)', example: 200000 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Trần giảm giá tối đa cho PERCENTAGE (VND). Bỏ qua với FIXED.', example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  maxDiscount?: number;

  @ApiPropertyOptional({ description: 'Tổng số lần dùng tối đa (null = không giới hạn)', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  usageLimit?: number;

  @ApiPropertyOptional({ description: 'Số lần tối đa mỗi người dùng (null = không giới hạn)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  perUserLimit?: number;

  @ApiProperty({ description: 'Ngày bắt đầu hiệu lực (ISO 8601)', example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiPropertyOptional({ description: 'Ngày hết hạn (ISO 8601). Bỏ trống = không có hạn.', example: '2026-06-30T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiredAt?: string;
}
