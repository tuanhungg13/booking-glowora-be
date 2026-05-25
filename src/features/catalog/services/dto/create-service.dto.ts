import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceStatus } from '@prisma/client';
import { CreateServiceVariantDto } from './service-variant.dto';

export class CreateServiceDto {
  @ApiProperty({ example: "Chăm sóc da mặt chuyên sâu" })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Liệu trình làm sạch sâu, cấp ẩm...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiProperty({
    type: [CreateServiceVariantDto],
    description: 'Danh sách gói dịch vụ, phải có ít nhất 1 gói',
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceVariantDto)
  variants!: CreateServiceVariantDto[];
}
