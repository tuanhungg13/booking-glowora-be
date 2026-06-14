import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceVariantDto {
  @ApiProperty({ example: 'Gói cơ bản' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Làm sạch + cấp ẩm cơ bản' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 45, description: 'Thời gian thực hiện (phút)', minimum: 1 })
  @IsInt()
  @Min(1)
  duration!: number;

  @ApiProperty({ example: 150000, minimum: 0 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 0, description: 'Thứ tự hiển thị' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;
}

export class UpdateServiceVariantDto {
  @ApiPropertyOptional({ example: 'Gói nâng cao' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 60, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ example: 250000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ServiceStatus })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;
}
