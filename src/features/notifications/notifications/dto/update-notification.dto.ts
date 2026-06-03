import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationDto {
  @ApiPropertyOptional({ example: true, description: 'Đánh dấu đã đọc hay chưa' })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
