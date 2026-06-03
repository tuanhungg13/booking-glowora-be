import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateReviewDto {
  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 5, description: 'Điểm đánh giá (1–5)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ example: 'Dịch vụ rất tốt, sẽ quay lại.', description: 'Nội dung nhận xét' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ example: true, description: 'Hiển thị review hay không (admin)' })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
