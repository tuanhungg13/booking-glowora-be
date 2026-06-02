import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SenderType } from '@prisma/client';

export class CreateMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsUUID()
  senderId!: string;

  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsEnum(SenderType)
  senderType?: SenderType;

  @IsOptional()
  isRead?: boolean;
}
