import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuditLog } from '../../../common/decorators/audit-log.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { PaymentsService } from './payments.service';
import { CreateVnpayPaymentDto } from './dto/create-vnpay-payment.dto';
import { LogType } from '@prisma/client';

@ApiTags('payments')
@Controller('')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({ summary: 'Tạo URL thanh toán VNPAY cho booking' })
  @ApiBearerAuth()
  @Post('payments/vnpay/create')
  @RequirePermissions(Permissions.PAYMENT.CREATE)
  createVnpay(
    @Body() dto: CreateVnpayPaymentDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.paymentsService.createVnpayPayment(dto.bookingId, user.id, req);
  }

  @ApiOperation({ summary: 'VNPAY return URL — browser redirect sau thanh toán' })
  @Public()
  @Get('payments/vnpay/return')
  async vnpayReturn(@Query() query: Record<string, string>, @Res() res: Response) {
    const redirectUrl = await this.paymentsService.handleReturn(query);
    return res.redirect(redirectUrl);
  }

  @ApiOperation({ summary: 'VNPAY IPN — webhook server-to-server' })
  @Public()
  @Post('payments/vnpay/ipn')
  @AuditLog({ type: LogType.PAYMENT_FAILED, targetType: 'Payment' })
  vnpayIpn(@Query() query: Record<string, string>, @Body() body: Record<string, string>) {
    return this.paymentsService.handleIpn({ ...query, ...body });
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
