import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ConversationStatus } from '@prisma/client';

export class UpdateConversationDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;
}
