import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateStaffDayOffDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
