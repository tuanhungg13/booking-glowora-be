import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateShopCategoryDto {
  @ApiProperty({ example: 'Nail gel cao cấp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: 'ID danh mục hệ thống (cấp 1)', example: '550e8400-...' })
  @IsUUID()
  parentId!: string;

  @ApiPropertyOptional({ example: 'Dịch vụ nail gel với nguyên liệu cao cấp nhập khẩu' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
