import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { MaterialUnit } from '@prisma/client';

export class CreateMaterialDto {
  @IsUUID()
  shopId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(MaterialUnit)
  unit!: MaterialUnit;

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;
}
