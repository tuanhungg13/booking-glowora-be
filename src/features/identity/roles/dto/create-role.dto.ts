import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsUUID } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    example: 'Shop Manager',
    description: 'The display name of the role',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'SHOP_MANAGER',
    description: 'The unique code for the role',
  })
  @IsString()
  code!: string;

  @ApiPropertyOptional({
    example: 'Responsible for managing shop operations and staff.',
    description: 'A brief description of the role',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The UUID of the shop this role belongs to (null for system roles)',
  })
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @ApiPropertyOptional({
    example: ['550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003'],
    description: 'List of permission UUIDs associated with this role',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
