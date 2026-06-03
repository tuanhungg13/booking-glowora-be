import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateConversationDto {
  @ApiPropertyOptional({ example: 'Xin chào, tôi muốn hỏi về dịch vụ...', description: 'Nội dung tin nhắn cuối' })
  @IsOptional()
  @IsString()
  lastMessageBody?: string;
}
