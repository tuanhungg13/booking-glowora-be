import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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

  @ApiPropertyOptional({ example: 30, minimum: 0, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bookingBufferMins?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;
}
