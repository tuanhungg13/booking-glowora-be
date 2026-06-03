import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Token mời nhân viên (nhận qua email)' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
