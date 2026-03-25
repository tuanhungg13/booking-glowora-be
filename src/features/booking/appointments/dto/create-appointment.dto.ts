import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AppointmentItemType, AppointmentStatus } from '@prisma/client';

/** API chỉ nhận SERVICE | COMBO | CUSTOM; COMBO_CHILD do hệ thống tạo khi expand combo */
const BOOKABLE_ITEM_TYPES = [
  AppointmentItemType.SERVICE,
  AppointmentItemType.COMBO,
  AppointmentItemType.CUSTOM,
] as const;

export class CreateAppointmentItemDto {
  @IsIn(BOOKABLE_ITEM_TYPES)
  type!: (typeof BOOKABLE_ITEM_TYPES)[number];

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsUUID()
  comboId?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  quantity?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateAppointmentDto {
  @IsUUID()
  shopId!: string;

  @IsUUID()
  customerId!: string;

  @IsDateString()
  startTime!: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAppointmentItemDto)
  items?: CreateAppointmentItemDto[];
}
