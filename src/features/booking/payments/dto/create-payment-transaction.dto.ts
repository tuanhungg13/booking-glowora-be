import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentStatus, PaymentTransactionType } from '@prisma/client';

export class CreatePaymentTransactionDto {
  @IsEnum(PaymentTransactionType)
  type!: PaymentTransactionType;

  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  providerTxnId?: string;

  /** Raw webhook / gateway payload for audit */
  @IsOptional()
  @IsObject()
  rawResponse?: Record<string, unknown>;
}
