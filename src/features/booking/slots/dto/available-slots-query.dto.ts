import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AvailableSlotsQueryDto {
  @IsDateString()
  date!: string;

  @IsUUID()
  serviceId!: string;

  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}
