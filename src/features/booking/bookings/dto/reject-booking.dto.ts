import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectBookingDto {
  @ApiProperty({ description: 'Lý do từ chối lịch hẹn (bắt buộc, 5–500 ký tự)', minLength: 5, maxLength: 500, example: 'Nhân viên không có lịch trống vào khung giờ này' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
