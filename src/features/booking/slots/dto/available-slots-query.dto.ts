import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AvailableSlotsQueryDto {
  @IsDateString()
  date!: string;

  @IsUUID()
  serviceId!: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}
