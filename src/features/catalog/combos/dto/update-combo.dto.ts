import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsArray, IsUUID, Min } from 'class-validator';
import { ComboStatus } from '@prisma/client';

class ComboServiceItemDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'The UUID of the service in the combo',
  })
  @IsUUID()
  serviceId!: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'The updated quantity of this service in the combo',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'The updated execution order of this service in the combo',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateComboDto {
  @ApiPropertyOptional({
    example: 'Ultimate Grooming Package',
    description: 'The updated name of the combo package',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Everything in the Total Package plus a soothing clay mask.',
    description: 'The updated description of the combo package',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 650000,
    description: 'The updated price of the combo package',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    example: 120,
    description: 'The updated estimated duration for the combo in minutes',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional({
    enum: ComboStatus,
    example: ComboStatus.ACTIVE,
    description: 'The updated status of the combo package',
  })
  @IsOptional()
  @IsEnum(ComboStatus)
  status?: ComboStatus;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440002',
    description: 'The updated category UUID for this combo',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    type: [ComboServiceItemDto],
    description: 'The updated list of services included in this combo',
  })
  @IsOptional()
  @IsArray()
  serviceIds?: ComboServiceItemDto[];
}
