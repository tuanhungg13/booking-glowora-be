import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class InviteStaffDto {
  @ApiProperty({ example: 'staff@example.com', description: 'Email của nhân viên cần mời' })
  @IsEmail()
  email: string;
}
