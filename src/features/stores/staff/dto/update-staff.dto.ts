import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StaffStatus } from '@prisma/client';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}
