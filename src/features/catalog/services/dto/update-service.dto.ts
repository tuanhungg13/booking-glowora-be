import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, IsUUID, ArrayMaxSize, Min, ValidateNested } from 'class-validator';
import { ServiceStatus } from '@prisma/client';

export class UpsertServiceVariantDto {
  @ApiPropertyOptional({ description: 'ID variant đã tồn tại (để update). Bỏ qua nếu tạo mới.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Gói cơ bản' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 45, description: 'Thời gian thực hiện (phút)', minimum: 1 })
  @IsInt()
  @Min(1)
  duration!: number;

  @ApiProperty({ example: 150000, minimum: 0 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 80000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ example: 0, description: 'Thứ tự hiển thị' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ServiceStatus })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;
}

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
    description: 'Danh sách URL ảnh (tối đa 5). Ảnh bị loại khỏi danh sách sẽ bị xoá trên Cloudinary.',
    maxItems: 5,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({
    type: [UpsertServiceVariantDto],
    description: 'Danh sách gói dịch vụ. Có id → update, không id → tạo mới, variant cũ không có trong list → vô hiệu hoá.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertServiceVariantDto)
  variants?: UpsertServiceVariantDto[];
}
