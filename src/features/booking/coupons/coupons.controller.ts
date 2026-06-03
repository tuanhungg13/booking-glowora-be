import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Kiểm tra mã coupon', description: 'Xem preview discount trước khi đặt lịch.' })
  @ApiResponse({ status: 200, description: 'Kết quả kiểm tra coupon' })
  validate(@Body() dto: ValidateCouponDto, @CurrentUser() user: CurrentUserPayload) {
    return this.couponsService.validate(dto.code, dto.storeId, user.id);
  }
}
