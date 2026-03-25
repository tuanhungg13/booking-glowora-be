import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStaffDayOffDto {
  @IsUUID()
  shopId!: string;

  @IsUUID()
  staffId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
