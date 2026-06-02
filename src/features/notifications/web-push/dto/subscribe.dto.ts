import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ description: 'Push subscription endpoint URL' })
  @IsString()
  endpoint: string;

  @ApiProperty({ description: 'P-256 DH public key (base64url)' })
  @IsString()
  p256dh: string;

  @ApiProperty({ description: 'Auth secret (base64url)' })
  @IsString()
  auth: string;
}

export class UnsubscribeDto {
  @ApiProperty({ description: 'Push subscription endpoint URL to remove' })
  @IsString()
  endpoint: string;
}
