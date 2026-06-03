import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SenderType } from '@prisma/client';

export class CreateMessageDto {
  @ApiProperty({ description: 'ID cuộc hội thoại', example: 'uuid-conversation-id' })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({ description: 'ID người gửi', example: 'uuid-sender-id' })
  @IsUUID()
  senderId!: string;

  @ApiProperty({ example: 'Xin chào, tôi muốn đặt lịch.', maxLength: 2000, description: 'Nội dung tin nhắn' })
  @IsString()
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ enum: SenderType, description: 'Loại người gửi' })
  @IsOptional()
  @IsEnum(SenderType)
  senderType?: SenderType;

  @ApiPropertyOptional({ example: false, description: 'Tin nhắn đã được đọc chưa' })
  @IsOptional()
  isRead?: boolean;
}
