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

export class CreateServiceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  duration!: number;

  @IsNumber()
  @Min(0)
  price!: number;

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
