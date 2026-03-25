import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @IsUUID()
  shopId!: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
