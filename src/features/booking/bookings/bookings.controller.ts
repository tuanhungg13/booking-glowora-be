import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { BookingsService } from './bookings.service';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @RequirePermissions(Permissions.APPOINTMENT.CREATE)
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.create(dto, user.id);
  }

  // MUST be before :id to avoid route conflict
  @Get('my')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findMy(@CurrentUser() user: CurrentUserPayload, @Query('status') status?: BookingStatus) {
    return this.bookingsService.findMy(user.id, status);
  }

  @Get(':id')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Patch(':id/cancel')
  @RequirePermissions(Permissions.APPOINTMENT.DELETE)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.bookingsService.cancel(id, user.id, dto.reason);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.APPOINTMENT.DELETE)
  remove(@Param('id') id: string) {
    return this.bookingsService.remove(id);
  }
}
