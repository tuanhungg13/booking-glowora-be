import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min } from 'class-validator';
import { StoreStatus } from '@prisma/client';

export class StoreFilterDto {
  @ApiPropertyOptional({ example: 1, description: 'ID tỉnh/thành phố' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  provinceId?: number;

  @ApiPropertyOptional({ example: 10101003, description: 'ID xã/phường' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  wardId?: number;

  @ApiPropertyOptional({ example: 'massage' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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

  @ApiPropertyOptional({ enum: ['avgRating', 'newest', 'name'], example: 'avgRating' })
  @IsOptional()
  @IsIn(['avgRating', 'newest', 'name'])
  sort?: 'avgRating' | 'newest' | 'name';

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 12, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminStoreFilterDto extends StoreFilterDto {
  @ApiPropertyOptional({ enum: StoreStatus })
  @IsOptional()
  @IsIn(Object.values(StoreStatus))
  status?: StoreStatus;
}
