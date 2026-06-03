import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiPropertyOptional({ description: 'ID của booking item (dịch vụ trong lịch hẹn)', example: 'uuid-booking-item-id' })
  @IsOptional()
  @IsUUID()
  bookingItemId?: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Điểm đánh giá (1–5 sao)' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ example: 'Dịch vụ rất chuyên nghiệp và tận tâm.', maxLength: 1000, description: 'Nội dung nhận xét' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/review1.jpg'],
    description: 'Danh sách URL ảnh đính kèm',
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[];
}
