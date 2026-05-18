import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ServiceStatus } from '@prisma/client';

export class CreateServiceDto {
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
}
