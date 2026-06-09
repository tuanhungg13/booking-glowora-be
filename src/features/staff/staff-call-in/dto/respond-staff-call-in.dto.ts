import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum RespondAction {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

export class RespondStaffCallInDto {
  @ApiProperty({ enum: RespondAction, description: 'Hành động: ACCEPT hoặc REJECT' })
  @IsEnum(RespondAction)
  action!: RespondAction;
}
