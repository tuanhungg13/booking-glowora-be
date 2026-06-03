import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ description: 'Mã coupon cần kiểm tra', example: 'SUMMER20' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'ID của cửa hàng đang đặt lịch', example: 'uuid-store-id' })
  @IsUUID()
  storeId!: string;
}
