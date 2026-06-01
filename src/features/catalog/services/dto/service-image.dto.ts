import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class RemoveServiceImageDto {
  @ApiProperty({ example: 'https://res.cloudinary.com/...' })
  @IsUrl()
  url!: string;
}
