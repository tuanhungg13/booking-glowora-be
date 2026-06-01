import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateShopCategoryDto {
  @ApiPropertyOptional({ example: 'Nail gel cao cap' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Dich vu nail gel voi vat lieu cao cap' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
