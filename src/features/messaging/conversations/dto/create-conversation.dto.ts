import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ description: 'ID của khách hàng', example: 'uuid-customer-id' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ description: 'ID của cửa hàng', example: 'uuid-store-id' })
  @IsUUID()
  storeId!: string;
}
