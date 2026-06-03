import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({ description: 'ID lịch hẹn', example: 'uuid-appointment-id' })
  @IsUUID()
  appointmentId!: string;

  @ApiPropertyOptional({ enum: PaymentMethod, description: 'Phương thức thanh toán' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 150000, minimum: 0, description: 'Số tiền thanh toán' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ enum: PaymentStatus, description: 'Trạng thái thanh toán' })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Mã giao dịch VNPAY' })
  @IsOptional()
  @IsString()
  vnpTxnRef?: string;
}
