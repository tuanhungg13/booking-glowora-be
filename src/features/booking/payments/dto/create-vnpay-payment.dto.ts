import { IsUUID } from 'class-validator';

export class CreateVnpayPaymentDto {
  @IsUUID()
  bookingId!: string;
}
