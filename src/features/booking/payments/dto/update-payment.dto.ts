import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class UpdatePaymentDto {
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

  @ApiPropertyOptional({ example: '2026-06-01T10:00:00.000Z', description: 'Thời điểm thanh toán (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
