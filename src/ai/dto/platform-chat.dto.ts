import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatHistoryItemDto {
  @ApiProperty({ enum: ['user', 'model'] })
  @IsIn(['user', 'model'])
  role!: 'user' | 'model';

  @ApiProperty()
  @Transform(({ value }) => (value != null ? String(value) : ''))
  @IsString()
  content!: string;
}

export class PlatformChatDto {
  @ApiProperty({ description: 'Tin nhắn của người dùng' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({
    description: 'Lịch sử hội thoại (client lưu và gửi lại mỗi request)',
    type: [ChatHistoryItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryItemDto)
  history?: ChatHistoryItemDto[];
}
