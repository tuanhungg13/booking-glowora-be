import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateStaffDayOffDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
