import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { MessageType, SenderType } from '@prisma/client';

export class CreateMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsEnum(SenderType)
  senderType!: SenderType;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;

  @IsOptional()
  telegramMsgId?: bigint;
}
