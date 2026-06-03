import { ApiPropertyOptional } from '@nestjs/swagger';
import { CouponType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CouponFilterDto {
  @ApiPropertyOptional({ description: 'Tìm kiếm theo mã coupon (không phân biệt hoa thường)', example: 'SUMMER' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo loại coupon' })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái kích hoạt' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Lọc coupon có hiệu lực từ ngày này (ISO 8601)', example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Lọc coupon có hiệu lực đến ngày này (ISO 8601)', example: '2026-06-30T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Trang hiện tại', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Số bản ghi mỗi trang', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
