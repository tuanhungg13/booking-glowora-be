import { IsUUID } from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  storeId!: string;
}
