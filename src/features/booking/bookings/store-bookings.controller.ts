import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';
import { BookingsService } from './bookings.service';
import { BookingFilterDto } from './dto/booking-filter.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { RejectBookingDto } from './dto/reject-booking.dto';

@Controller('store-bookings')
export class StoreBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // calendar MUST be before the root @Get() to avoid route conflict
  @Get('calendar')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  getCalendar(@ShopId() storeId: string, @Query() query: CalendarQueryDto) {
    return this.bookingsService.findCalendar(storeId, query.month);
  }

  @Get()
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findAll(@ShopId() storeId: string, @Query() filter: BookingFilterDto) {
    return this.bookingsService.findStoreBookings(storeId, filter);
  }

  @Patch(':id/confirm')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.confirm(id, user.id);
  }

  @Patch(':id/reject')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectBookingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.bookingsService.reject(id, user.id, dto.reason);
  }

  @Patch(':id/complete')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  complete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.complete(id, user.id);
  }
}
