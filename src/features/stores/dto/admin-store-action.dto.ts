import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminStoreActionDto {
  @ApiPropertyOptional({ example: 'Thong tin co so chua hop le.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
