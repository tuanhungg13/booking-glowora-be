import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { StaffStatus } from '@prisma/client';

export class UpdateStaffDto {
  @ApiPropertyOptional({ example: 'Nail gel, chăm sóc da' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: 'Chuyên gia 5 năm kinh nghiệm' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: '+84912345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: '123 Đường Lê Lợi' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  provinceId?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  wardId?: number;

  @ApiPropertyOptional({ enum: StaffStatus, example: StaffStatus.ACTIVE })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}
