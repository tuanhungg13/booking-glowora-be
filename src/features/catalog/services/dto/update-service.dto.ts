import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUrl, IsUUID, ArrayMaxSize } from 'class-validator';
import { ServiceStatus } from '@prisma/client';

export class UpdateServiceDto {
  @ApiPropertyOptional({ example: 'Chăm sóc da mặt cao cấp' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ServiceStatus })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiPropertyOptional({
    type: [String],
    description: 'Danh sách URL ảnh mới (tối đa 5). Ảnh bị loại khỏi danh sách sẽ bị xoá trên Cloudinary.',
    maxItems: 5,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  imageUrls?: string[];
}
