import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { AppointmentsService } from './appointments.service';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @RequirePermissions(Permissions.APPOINTMENT.CREATE)
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.appointmentsService.create(dto, user.id);
  }

  // MUST be before :id to avoid route conflict
  @Get('my')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findMy(@CurrentUser() user: CurrentUserPayload, @Query('status') status?: AppointmentStatus) {
    return this.appointmentsService.findMy(user.id, status);
  }

  @Get(':id')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id/cancel')
  @RequirePermissions(Permissions.APPOINTMENT.DELETE)
  cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.appointmentsService.cancel(id, user.id, dto.reason);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.APPOINTMENT.DELETE)
  remove(@Param('id') id: string) {
    return this.appointmentsService.remove(id);
  }
}
