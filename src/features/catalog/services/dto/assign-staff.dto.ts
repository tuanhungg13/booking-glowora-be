import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignStaffDto {
  @ApiProperty({ type: [String], example: ['uuid-staff-1', 'uuid-staff-2'] })
  @IsArray()
  @IsUUID('all', { each: true })
  staffIds!: string[];
}
