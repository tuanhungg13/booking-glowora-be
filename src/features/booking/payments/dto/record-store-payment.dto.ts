import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod, PaymentType } from '@prisma/client';

export class RecordStorePaymentDto {
  @ApiProperty({
    enum: [PaymentMethod.CASH, PaymentMethod.SEPAY],
    description: 'CASH = ghi nhận tiền mặt trực tiếp, SEPAY = tạo QR chuyển khoản cho khách quét tại cửa hàng',
  })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentType,
    description:
      'Chỉ có hiệu lực khi booking đang DEPOSIT_PENDING. DEPOSIT = chỉ thu tiền cọc, FULL = thu toàn bộ. Mặc định: FULL.',
  })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;
}
