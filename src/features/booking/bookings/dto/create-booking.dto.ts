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
  @IsUUID()
  serviceId!: string;

  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}

export class CreateBookingDto {
  @IsUUID()
  storeId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingServiceItemDto)
  services!: BookingServiceItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
