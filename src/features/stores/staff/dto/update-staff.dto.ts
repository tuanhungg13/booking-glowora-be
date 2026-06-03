import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StaffStatus } from '@prisma/client';

export class UpdateStaffDto {
  @ApiPropertyOptional({ example: 'Nail gel, chăm sóc da', description: 'Chuyên môn của nhân viên' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: 'Chuyên gia 5 năm kinh nghiệm', description: 'Giới thiệu bản thân' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ enum: StaffStatus, example: StaffStatus.ACTIVE, description: 'Trạng thái nhân viên' })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}
