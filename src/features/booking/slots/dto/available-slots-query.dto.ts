import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SlotServiceItemDto {
  @ApiProperty({ description: 'ID của dịch vụ', example: 'uuid-service-id' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ description: 'ID của biến thể dịch vụ', example: 'uuid-variant-id' })
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({ description: 'ID nhân viên muốn chọn (nếu có)', example: 'uuid-staff-id' })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}

export class AvailableSlotsDto {
  @ApiProperty({ description: 'Ngày cần kiểm tra slot (ISO 8601)', example: '2026-06-01' })
  @IsDateString()
  date!: string;

  @ApiProperty({ type: [SlotServiceItemDto], description: 'Danh sách dịch vụ cần tính slot (ít nhất 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SlotServiceItemDto)
  services!: SlotServiceItemDto[];
}
