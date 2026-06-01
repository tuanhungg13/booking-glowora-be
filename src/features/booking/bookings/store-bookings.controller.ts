import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';
import { BookingsService } from './bookings.service';
import { BookingFilterDto } from './dto/booking-filter.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { RejectBookingDto } from './dto/reject-booking.dto';

@ApiTags('store-bookings')
@ApiBearerAuth()
@Controller('store-bookings')
export class StoreBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // calendar MUST be before the root @Get() to avoid route conflict
  @Get('calendar')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  @ApiOperation({ summary: 'Xem lịch hẹn theo tháng (dạng calendar)', description: 'Trả về danh sách lịch hẹn của cửa hàng trong một tháng cụ thể, dùng để hiển thị calendar. Shop ID lấy từ header X-Shop-Id.' })
  @ApiResponse({ status: 200, description: 'Dữ liệu lịch hẹn theo tháng' })
  @ApiResponse({ status: 400, description: 'Tháng không đúng định dạng YYYY-MM' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem lịch hẹn' })
  getCalendar(@ShopId() storeId: string, @Query() query: CalendarQueryDto) {
    return this.bookingsService.findCalendar(storeId, query.month, query.status, query.staffId);
  }

  @Get()
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  @ApiOperation({ summary: 'Danh sách lịch hẹn của cửa hàng', description: 'Lấy danh sách lịch hẹn có phân trang và bộ lọc. Shop ID lấy từ header X-Shop-Id.' })
  @ApiResponse({ status: 200, description: 'Danh sách lịch hẹn có phân trang' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem lịch hẹn' })
  findAll(@ShopId() storeId: string, @Query() filter: BookingFilterDto) {
    return this.bookingsService.findStoreBookings(storeId, filter);
  }

  @Patch(':id/confirm')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  @ApiOperation({ summary: 'Xác nhận lịch hẹn', description: 'Cửa hàng xác nhận lịch hẹn của khách. Chỉ áp dụng cho lịch hẹn đang ở trạng thái PENDING.' })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn cần xác nhận' })
  @ApiResponse({ status: 200, description: 'Xác nhận lịch hẹn thành công' })
  @ApiResponse({ status: 400, description: 'Lịch hẹn không ở trạng thái PENDING' })
  @ApiResponse({ status: 403, description: 'Không có quyền xác nhận lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.confirm(id, user.id);
  }

  @Patch(':id/reject')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  @ApiOperation({ summary: 'Từ chối lịch hẹn', description: 'Cửa hàng từ chối lịch hẹn của khách. Bắt buộc cung cấp lý do từ chối.' })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn cần từ chối' })
  @ApiResponse({ status: 200, description: 'Từ chối lịch hẹn thành công' })
  @ApiResponse({ status: 400, description: 'Lịch hẹn không thể từ chối ở trạng thái hiện tại' })
  @ApiResponse({ status: 403, description: 'Không có quyền từ chối lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectBookingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.bookingsService.reject(id, user.id, dto.reason);
  }

  @Patch(':id/complete')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  @ApiOperation({ summary: 'Hoàn thành lịch hẹn', description: 'Đánh dấu lịch hẹn đã hoàn thành sau khi khách đã sử dụng dịch vụ.' })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn cần đánh dấu hoàn thành' })
  @ApiResponse({ status: 200, description: 'Lịch hẹn được đánh dấu hoàn thành' })
  @ApiResponse({ status: 400, description: 'Lịch hẹn không ở trạng thái CONFIRMED' })
  @ApiResponse({ status: 403, description: 'Không có quyền cập nhật lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  complete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.complete(id, user.id);
  }
}
