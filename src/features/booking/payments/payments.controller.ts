import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { PaymentStatus } from '@prisma/client';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @RequirePermissions(Permissions.PAYMENT.CREATE)
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @Get()
  @RequirePermissions(Permissions.PAYMENT.VIEW)
  findAll(
    @Query('status') status?: PaymentStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.paymentsService.findAll({
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.PAYMENT.VIEW)
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.PAYMENT.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.paymentsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.PAYMENT.DELETE)
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(id);
  }
}
