import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsArray, IsUUID, Min } from 'class-validator';
import { ServiceStatus } from '@prisma/client';

class MaterialQuantityDto {
  @IsUUID()
  materialId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  quantity?: number;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  materialIds?: MaterialQuantityDto[];
}
