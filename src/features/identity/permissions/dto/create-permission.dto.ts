import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'USER_CREATE',
    description: 'The unique code for the permission',
  })
  @IsString()
  code: string;

  @ApiPropertyOptional({
    example: 'Create User',
    description: 'The display name of the permission',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Allows the user to create new user accounts.',
    description: 'A brief description of what this permission allows',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
