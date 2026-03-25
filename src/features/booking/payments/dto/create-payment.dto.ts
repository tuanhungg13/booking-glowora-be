import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentStatus } from '@prisma/client';
import { CreatePaymentTransactionDto } from './create-payment-transaction.dto';

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

  /** Optional audit rows (charge / refund attempts) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentTransactionDto)
  transactions?: CreatePaymentTransactionDto[];
}
