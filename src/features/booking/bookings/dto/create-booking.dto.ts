import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class BookingServiceItemDto {
  @ApiProperty({ description: 'ID của dịch vụ', example: 'uuid-service-id' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ description: 'ID của biến thể dịch vụ', example: 'uuid-variant-id' })
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({ description: 'ID của nhân viên thực hiện (nếu chọn)', example: 'uuid-staff-id' })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}

export class CreateBookingDto {
  @ApiProperty({ description: 'ID của cửa hàng', example: 'uuid-store-id' })
  @IsUUID()
  storeId!: string;

  @ApiProperty({ description: 'Thời điểm đặt lịch (ISO 8601)', example: '2026-06-01T09:00:00.000Z' })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ type: [BookingServiceItemDto], description: 'Danh sách dịch vụ đặt (ít nhất 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingServiceItemDto)
  services!: BookingServiceItemDto[];

  @ApiPropertyOptional({ description: 'Ghi chú thêm cho lịch hẹn', maxLength: 1000, example: 'Khách muốn phòng riêng' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
