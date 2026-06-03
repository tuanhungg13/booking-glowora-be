import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ServiceStatus } from '@prisma/client';

export class ServiceQueryDto {
  @ApiPropertyOptional({ enum: ServiceStatus })
  @IsOptional()
  @IsIn(Object.values(ServiceStatus))
  status?: ServiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all')
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['name', 'name-desc', 'price', 'price-desc', 'avgRating', 'avgRating-asc'], example: 'name' })
  @IsOptional()
  @IsIn(['name', 'name-desc', 'price', 'price-desc', 'avgRating', 'avgRating-asc'])
  sort?: 'name' | 'name-desc' | 'price' | 'price-desc' | 'avgRating' | 'avgRating-asc';

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PublicServiceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all')
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all')
  categoryId?: string;

  @ApiPropertyOptional({ example: 'facial' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 100000, description: 'Giá tối thiểu (theo variant thấp nhất)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 500000, description: 'Giá tối đa (theo variant thấp nhất)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5, description: 'Rating tối thiểu' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 5, description: 'Rating tối đa' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  maxRating?: number;

  @ApiPropertyOptional({ enum: ['avgRating', 'price', 'price-desc', 'newest', 'popular'], example: 'avgRating' })
  @IsOptional()
  @IsIn(['avgRating', 'price', 'price-desc', 'newest', 'popular'])
  sort?: 'avgRating' | 'price' | 'price-desc' | 'newest' | 'popular';

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
