import { IsOptional, IsString } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
