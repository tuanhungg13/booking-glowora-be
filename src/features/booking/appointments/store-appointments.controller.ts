import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';
import { AppointmentsService } from './appointments.service';
import { AppointmentFilterDto } from './dto/appointment-filter.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { RejectAppointmentDto } from './dto/reject-appointment.dto';

@Controller('store-appointments')
export class StoreAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // calendar MUST be before the root @Get() to avoid route conflict
  @Get('calendar')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  getCalendar(
    @ShopId() storeId: string,
    @Query() query: CalendarQueryDto,
  ) {
    return this.appointmentsService.findCalendar(storeId, query.month);
  }

  @Get()
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findAll(@ShopId() storeId: string, @Query() filter: AppointmentFilterDto) {
    return this.appointmentsService.findStoreAppointments(storeId, filter);
  }

  @Patch(':id/confirm')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.appointmentsService.confirm(id, user.id);
  }

  @Patch(':id/reject')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectAppointmentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.appointmentsService.reject(id, user.id, dto.reason);
  }

  @Patch(':id/complete')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  complete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.appointmentsService.complete(id, user.id);
  }
}
