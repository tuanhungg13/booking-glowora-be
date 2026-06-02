import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsUUID } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({
    example: 'Senior Stylist',
    description: 'The updated display name of the role',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'SENIOR_STYLIST',
    description: 'The updated unique code for the role',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    example: 'An experienced stylist with additional management permissions.',
    description: 'The updated description of the role',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The UUID of the store this role belongs to',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({
    example: ['550e8400-e29b-41d4-a716-446655440005'],
    description: 'The updated list of permission UUIDs',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
