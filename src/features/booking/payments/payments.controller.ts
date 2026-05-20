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
import { Permissions } from '../../../common/constants/permissions';
import { PaymentsService } from './payments.service';
import { CreateVnpayPaymentDto } from './dto/create-vnpay-payment.dto';

@ApiTags('payments')
@Controller('')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({ summary: 'Tạo URL thanh toán VNPAY' })
  @ApiBearerAuth()
  @Post('payments/vnpay/create')
  @RequirePermissions(Permissions.PAYMENT.CREATE)
  createVnpay(
    @Body() dto: CreateVnpayPaymentDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.paymentsService.createVnpayPayment(dto.appointmentId, user.id, req);
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
  vnpayIpn(@Query() query: Record<string, string>, @Body() body: Record<string, string>) {
    return this.paymentsService.handleIpn({ ...query, ...body });
  }

  @ApiOperation({ summary: 'Lịch sử thanh toán của tôi' })
  @ApiBearerAuth()
  @Get('payments/my')
  findMy(@CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.findMyPayments(user.id);
  }

  @ApiOperation({ summary: 'Trạng thái thanh toán của một lịch hẹn' })
  @ApiBearerAuth()
  @Get('appointments/:id/payment')
  findByAppointment(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.paymentsService.findPaymentByAppointment(id, user.id);
  }
}
