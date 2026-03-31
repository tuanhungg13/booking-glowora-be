import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsArray, IsUUID, Min } from 'class-validator';
import { ServiceStatus } from '@prisma/client';

class MaterialQuantityDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'The UUID of the material',
  })
  @IsUUID()
  materialId!: string;

  @ApiPropertyOptional({
    example: 50,
    description: 'The quantity of the material used in the service (e.g., in ml or grams)',
    minimum: 0.001,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  quantity?: number;
}

export class CreateServiceDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The UUID of the shop this service belongs to',
  })
  @IsUUID()
  shopId!: string;

  @ApiProperty({
    example: 'Men\'s Haircut',
    description: 'The name of the service',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    example: 'A standard men\'s haircut including wash and style.',
    description: 'A brief description of the service',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 30,
    description: 'The duration of the service in minutes',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  duration!: number;

  @ApiProperty({
    example: 250000,
    description: 'The price of the service in the shop\'s currency',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'The cost price of the service (internal use)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({
    enum: ServiceStatus,
    example: ServiceStatus.ACTIVE,
    description: 'The status of the service',
  })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440002',
    description: 'The UUID of the category this service belongs to',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    type: [MaterialQuantityDto],
    description: 'List of materials and their quantities used in this service',
  })
  @IsOptional()
  @IsArray()
  materialIds?: MaterialQuantityDto[];
}
