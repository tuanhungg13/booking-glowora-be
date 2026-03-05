import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsArray, IsUUID, Min } from 'class-validator';
import { ComboStatus } from '@prisma/client';

class ComboServiceItemDto {
  @IsUUID()
  serviceId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateComboDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsEnum(ComboStatus)
  status?: ComboStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  serviceIds?: ComboServiceItemDto[];
}
