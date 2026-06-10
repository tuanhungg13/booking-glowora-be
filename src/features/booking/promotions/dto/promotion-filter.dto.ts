import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CouponType, PromotionScope } from '@prisma/client';

export class PromotionFilterDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên chương trình' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: CouponType })
  @IsOptional()
  @IsIn(Object.values(CouponType))
  type?: CouponType;

  @ApiPropertyOptional({ enum: PromotionScope })
  @IsOptional()
  @IsIn(Object.values(PromotionScope))
  scope?: PromotionScope;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái kích hoạt' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

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
