import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, IsDateString, Min } from 'class-validator';
import { PaymentStatus } from '@prisma/client';

export class CreatePaymentDto {
  @IsUUID()
  appointmentId!: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
