import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsArray, IsUUID, Min } from 'class-validator';
import { ComboStatus } from '@prisma/client';

class ComboServiceItemDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'The UUID of the service in the combo',
  })
  @IsUUID()
  serviceId!: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'The quantity of this service in the combo',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'The execution order of this service in the combo',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateComboDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The UUID of the shop this combo belongs to',
  })
  @IsUUID()
  shopId!: string;

  @ApiProperty({
    example: 'Total Grooming Package',
    description: 'The name of the combo package',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    example: 'Combining haircut, beard trim, and facial treatment at a discounted rate.',
    description: 'A brief description of the combo package',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 500000,
    description: 'The discounted price of the combo package',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({
    example: 90,
    description: 'Estimated duration for the entire combo in minutes',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional({
    enum: ComboStatus,
    example: ComboStatus.ACTIVE,
    description: 'The status of the combo package',
  })
  @IsOptional()
  @IsEnum(ComboStatus)
  status?: ComboStatus;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440002',
    description: 'The UUID of the category this combo belongs to',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    type: [ComboServiceItemDto],
    description: 'List of services included in this combo package',
  })
  @IsOptional()
  @IsArray()
  serviceIds?: ComboServiceItemDto[];
}
