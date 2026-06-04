import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SepayWebhookDto {
  @IsInt()
  id!: number;

  @IsString()
  @IsNotEmpty()
  gateway!: string;

  @IsString()
  @IsNotEmpty()
  transactionDate!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  subAccount!: string | null;

  @IsOptional()
  @IsString()
  code!: string | null;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsNotEmpty()
  transferType!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  transferAmount!: number;

  @IsNumber()
  accumulated!: number;

  @IsOptional()
  @IsString()
  referenceCode!: string | null;
}
