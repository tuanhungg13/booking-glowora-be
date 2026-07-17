import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser, type CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreateSepayPaymentDto } from './dto/create-sepay-payment.dto';
import { SepayWebhookDto } from './dto/sepay-webhook.dto';

@ApiTags('payments')
@Controller('')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({ summary: 'Tạo lệnh thanh toán SePay (chuyển khoản) cho booking' })
  @ApiBearerAuth()
  @Post('payments/sepay/create')
  createSepay(
    @Body() dto: CreateSepayPaymentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.paymentsService.createSepayPayment(dto.bookingId, user.id, dto.paymentType);
  }

  @ApiOperation({ summary: 'SePay webhook — nhận thông báo khi tiền về tài khoản shop' })
  @Public()
  // Gọi từ server SePay (đã xác thực bằng Authorization header riêng), không phải traffic
  // người dùng cuối -> không áp rate-limit theo IP.
  @SkipThrottle()
  @Post('payments/sepay/webhook/:storeId')
  sepayWebhook(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() body: SepayWebhookDto,
    @Headers('authorization') authHeader: string,
  ) {
    return this.paymentsService.handleSepayWebhook(body, authHeader, storeId);
  }

  @ApiOperation({ summary: 'Lịch sử thanh toán của tôi' })
  @ApiBearerAuth()
  @Get('payments/my')
  findMy(@CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.findMyPayments(user.id);
  }

  @ApiOperation({ summary: 'Trạng thái thanh toán của một booking' })
  @ApiBearerAuth()
  @Get('bookings/:id/payment')
  findByBooking(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.paymentsService.findPaymentByBooking(id, user.id);
  }
}
