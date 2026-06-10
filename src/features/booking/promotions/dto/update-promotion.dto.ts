import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePromotionDto {
  @ApiPropertyOptional({ description: 'Tên chương trình khuyến mãi' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Bật/tắt chương trình' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Cập nhật ngày kết thúc (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endAt?: string;
}
