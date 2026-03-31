import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdatePermissionDto {
  @ApiPropertyOptional({
    example: 'USER_UPDATE',
    description: 'The updated unique code for the permission',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    example: 'Allows the user to modify existing user accounts and their roles.',
    description: 'the updated description of the permission',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
