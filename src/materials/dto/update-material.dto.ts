import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MaterialUnit } from '@prisma/client';

export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MaterialUnit)
  unit?: MaterialUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;
}
