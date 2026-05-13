import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class WorkingHourItemDto {
  @ApiProperty({ enum: DayOfWeek, example: DayOfWeek.MONDAY })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  openTime!: string;

  @ApiProperty({ example: '20:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  closeTime!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isClosed!: boolean;
}

export class UpdateWorkingHoursDto {
  @ApiProperty({ type: [WorkingHourItemDto] })
  @ValidateNested({ each: true })
  @Type(() => WorkingHourItemDto)
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  hours!: WorkingHourItemDto[];
}
