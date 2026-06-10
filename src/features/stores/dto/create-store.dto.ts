import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'Glowora Spa Ha Noi' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: '123 Nguyen Du' })
  @IsString()
  @MaxLength(300)
  address!: string;

  @ApiPropertyOptional({ example: 10101003, description: 'ID xã/phường từ bảng wards' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  wardId?: number;

  @ApiPropertyOptional({ example: 1, description: 'ID tỉnh/thành phố từ bảng provinces' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  provinceId?: number;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional({ example: 'contact@glowora.vn' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'https://glowora.vn' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'Spa cham soc da va massage thu gian.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 30, minimum: 15, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  slotIntervalMins?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 48 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(48)
  cancelBeforeHours?: number;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  maxAdvanceDays?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;

  // ── CCCD ────────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @IsOptional() @IsString() @MaxLength(150)
  cccdFullName?: string;

  @ApiPropertyOptional({ example: '001234567890' })
  @IsOptional() @IsString() @MaxLength(20)
  citizenId?: string;

  @ApiPropertyOptional({ example: '1990-01-15', description: 'ISO date YYYY-MM-DD' })
  @IsOptional() @IsDateString()
  cccdDateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Nam', description: 'Nam | Nữ | Khác' })
  @IsOptional() @IsString() @MaxLength(10)
  cccdGender?: string;

  @ApiPropertyOptional({ example: 'Việt Nam' })
  @IsOptional() @IsString() @MaxLength(50)
  cccdNationality?: string;

  @ApiPropertyOptional({ example: '123 Nguyen Du, Hanoi' })
  @IsOptional() @IsString() @MaxLength(500)
  cccdAddress?: string;

  @ApiPropertyOptional({ example: '2021-05-20' })
  @IsOptional() @IsDateString()
  cccdIssueDate?: string;

  @ApiPropertyOptional({ example: '2031-05-20' })
  @IsOptional() @IsDateString()
  cccdExpiryDate?: string;

  // ── Giấy phép kinh doanh ────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'Công ty TNHH Glowora' })
  @IsOptional() @IsString() @MaxLength(200)
  bizName?: string;

  @ApiPropertyOptional({ example: '0123456789', description: 'Mã số doanh nghiệp / MST' })
  @IsOptional() @IsString() @MaxLength(50)
  bizCode?: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A', description: 'Người đại diện pháp lý' })
  @IsOptional() @IsString() @MaxLength(150)
  bizOwnerName?: string;

  @ApiPropertyOptional({ example: '123 Nguyen Du, Hanoi' })
  @IsOptional() @IsString() @MaxLength(500)
  bizAddress?: string;

  @ApiPropertyOptional({ example: '2020-01-01' })
  @IsOptional() @IsDateString()
  bizIssueDate?: string;

  @ApiPropertyOptional({ example: 'Spa, massage, chăm sóc sức khỏe' })
  @IsOptional() @IsString()
  bizLine?: string;
}
