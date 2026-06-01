import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', description: 'Mã OTP 6 chữ số được gửi về email' })
  @IsString()
  @Length(6, 6, { message: 'OTP phải có đúng 6 ký tự' })
  otp: string;
}
