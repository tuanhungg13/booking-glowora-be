import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @IsUUID()
  userId!: string;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
