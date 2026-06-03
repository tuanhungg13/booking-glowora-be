import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPaymentConfigDto {
  @ApiProperty({ description: 'BIN ngân hàng (VD: 970422 = MB, 970436 = Vietcombank)', example: '970422' })
  @IsString()
  @MaxLength(10)
  bankBin!: string;

  @ApiProperty({ description: 'Số tài khoản ngân hàng', example: '0001234567890' })
  @IsString()
  @MaxLength(30)
  bankAccountNo!: string;

  @ApiProperty({ description: 'Tên chủ tài khoản (in hoa, không dấu)', example: 'NGUYEN VAN A' })
  @IsString()
  @MaxLength(100)
  bankAccountName!: string;

  @ApiPropertyOptional({
    description: 'API key SePay của shop (dùng để xác thực webhook). Nếu không điền sẽ dùng platform secret.',
    example: 'sepay_apikey_xxxx',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sepayApiKey?: string;
}
