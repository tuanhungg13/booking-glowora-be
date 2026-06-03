import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @ApiProperty({ description: 'ID người dùng nhận notification', example: 'uuid-user-id' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: NotificationType, description: 'Loại notification' })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ example: 'Lịch hẹn đã được xác nhận', description: 'Tiêu đề notification' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'Lịch hẹn của bạn lúc 9:00 ngày 01/06 đã được xác nhận.', description: 'Nội dung notification' })
  @IsString()
  body!: string;

  @ApiPropertyOptional({ description: 'ID lịch hẹn liên quan', example: 'uuid-booking-id' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ example: false, description: 'Đã đọc chưa (mặc định false)' })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
