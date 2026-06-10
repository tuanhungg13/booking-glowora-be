import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CouponType, PromotionScope } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePromotionDto {
  @ApiProperty({ description: 'Tên chương trình khuyến mãi', example: 'Sinh nhật Glowora Spa - Giảm 20%' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CouponType, description: 'Loại giảm giá: PERCENTAGE (%) hoặc FIXED (VND)' })
  @IsEnum(CouponType)
  type!: CouponType;

  @ApiProperty({ description: 'Giá trị giảm: % hoặc số tiền VND', example: 20 })
  @Type(() => Number)
  @IsPositive()
  value!: number;

  @ApiProperty({ enum: PromotionScope, description: 'Phạm vi áp dụng', default: PromotionScope.STORE })
  @IsEnum(PromotionScope)
  scope!: PromotionScope;

  @ApiPropertyOptional({ description: 'Danh sách categoryId (khi scope = CATEGORY)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ description: 'Danh sách serviceId (khi scope = SERVICE)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];

  @ApiProperty({ description: 'Ngày bắt đầu hiệu lực (ISO 8601)', example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiPropertyOptional({ description: 'Ngày kết thúc (ISO 8601). Bỏ trống = không có hạn.', example: '2026-06-15T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  endAt?: string;
}
