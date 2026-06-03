import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMessageDto {
  @ApiPropertyOptional({ example: 'Nội dung đã chỉnh sửa', maxLength: 2000, description: 'Nội dung tin nhắn mới' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ example: true, description: 'Đánh dấu tin nhắn đã đọc' })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
