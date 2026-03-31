import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsArray, IsUUID, Min } from 'class-validator';
import { ServiceStatus } from '@prisma/client';

class MaterialQuantityDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'The UUID of the material',
  })
  @IsUUID()
  materialId!: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'The updated quantity of the material used in the service',
    minimum: 0.001,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  quantity?: number;
}

export class UpdateServiceDto {
  @ApiPropertyOptional({
    example: 'Deluxe Men\'s Haircut',
    description: 'The updated name of the service',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Premium haircut including hot towel and scalp massage.',
    description: 'The updated description of the service',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 45,
    description: 'The updated duration of the service in minutes',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({
    example: 350000,
    description: 'The updated price of the service',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    example: 70000,
    description: 'The updated cost price of the service',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({
    enum: ServiceStatus,
    example: ServiceStatus.ACTIVE,
    description: 'The updated status of the service',
  })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440002',
    description: 'The updated category UUID for this service',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    type: [MaterialQuantityDto],
    description: 'The updated list of materials and their quantities',
  })
  @IsOptional()
  @IsArray()
  materialIds?: MaterialQuantityDto[];
}
