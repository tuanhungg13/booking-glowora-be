import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BookingServiceItemDto } from './create-booking.dto';

export class CreateWalkInBookingDto {
  @ApiProperty({ description: 'Thời điểm đặt lịch (ISO 8601)', example: '2026-06-01T09:00:00.000Z' })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ type: [BookingServiceItemDto], description: 'Danh sách dịch vụ (ít nhất 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingServiceItemDto)
  services!: BookingServiceItemDto[];

  @ApiProperty({ description: 'Tên khách vãng lai', maxLength: 150, example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  guestName!: string;

  @ApiPropertyOptional({ description: 'Số điện thoại khách vãng lai', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  guestPhone?: string;

  @ApiPropertyOptional({ description: 'Ghi chú thêm', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
