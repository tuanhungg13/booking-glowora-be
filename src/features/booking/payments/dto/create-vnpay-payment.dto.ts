import { IsUUID } from 'class-validator';

export class CreateVnpayPaymentDto {
  @IsUUID()
  appointmentId!: string;
}
