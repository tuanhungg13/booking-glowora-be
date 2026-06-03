import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaymentType } from '@prisma/client';

export class CreateSepayPaymentDto {
  @IsUUID()
  bookingId!: string;

  @ApiPropertyOptional({
    enum: PaymentType,
    description:
      'Chỉ áp dụng khi booking đang DEPOSIT_PENDING. DEPOSIT = chỉ thanh toán cọc, FULL = thanh toán toàn bộ. Mặc định: DEPOSIT.',
  })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;
}
