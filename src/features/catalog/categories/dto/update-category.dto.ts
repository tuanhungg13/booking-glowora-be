import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional({
    example: 'Premium Haircuts',
    description: 'The updated name of the category',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Specialized haircuts by master stylists.',
    description: 'The updated description of the category',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
