import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

class ReasonDto {
  reason?: string;
}

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @RequirePermissions(Permissions.APPOINTMENT.CREATE)
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.appointmentsService.create(dto, user.id);
  }

  @Get('my')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findMy(@CurrentUser() user: CurrentUserPayload, @Query('status') status?: AppointmentStatus) {
    return this.appointmentsService.findMy(user.id, status);
  }

  @Get()
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findAll(
    @Query('storeId') storeId?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.appointmentsService.findAll({
      storeId,
      status,
      customerId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentsService.update(id, dto);
  }

  @Patch(':id/confirm')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  confirm(@Param('id') id: string) {
    return this.appointmentsService.confirm(id);
  }

  @Patch(':id/reject')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  reject(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.appointmentsService.reject(id, dto.reason);
  }

  @Patch(':id/complete')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  complete(@Param('id') id: string) {
    return this.appointmentsService.complete(id);
  }

  @Patch(':id/cancel')
  @RequirePermissions(Permissions.APPOINTMENT.DELETE)
  cancel(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.appointmentsService.cancel(id, dto.reason);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.APPOINTMENT.DELETE)
  remove(@Param('id') id: string) {
    return this.appointmentsService.remove(id);
  }
}
