import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { ConversationStatus } from '@prisma/client';

export class UpdateConversationDto {
  /** Gửi null để gỡ staff; không gửi field để giữ nguyên */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  staffId?: string | null;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;
}
