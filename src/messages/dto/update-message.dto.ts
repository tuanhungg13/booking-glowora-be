import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MessageType } from '@prisma/client';

export class UpdateMessageDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;
}
