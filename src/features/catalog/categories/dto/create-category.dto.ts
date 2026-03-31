import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The UUID of the shop this category belongs to',
  })
  @IsUUID()
  shopId!: string;

  @ApiProperty({
    example: 'Haircuts',
    description: 'The name of the category',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'All types of hair cutting and styling services.',
    description: 'A brief description of the category',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
