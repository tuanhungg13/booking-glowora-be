import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsUUID, ValidateNested } from 'class-validator';

export class StaffQueryServiceItemDto {
  @ApiProperty({ description: 'ID của dịch vụ', example: 'uuid-service-id' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ description: 'ID của biến thể dịch vụ', example: 'uuid-variant-id' })
  @IsUUID()
  variantId!: string;
}

export class AvailableStaffQueryDto {
  @ApiProperty({ description: 'Ngày cần kiểm tra (YYYY-MM-DD)', example: '2026-06-15' })
  @IsDateString()
  date!: string;

  @ApiProperty({ type: [StaffQueryServiceItemDto], description: 'Danh sách dịch vụ muốn đặt (ít nhất 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StaffQueryServiceItemDto)
  services!: StaffQueryServiceItemDto[];
}
