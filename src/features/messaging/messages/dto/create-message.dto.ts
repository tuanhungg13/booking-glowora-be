import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsUUID()
  senderId!: string;

  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  isRead?: boolean;
}
