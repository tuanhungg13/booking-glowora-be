import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuditLog } from '../../../common/decorators/audit-log.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';
import { BookingsService } from './bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { BookingFilterDto } from './dto/booking-filter.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { RejectBookingDto } from './dto/reject-booking.dto';
import { RecordStorePaymentDto } from '../payments/dto/record-store-payment.dto';
import { LogType } from '@prisma/client';

@ApiTags('store-bookings')
@ApiBearerAuth()
@ApiHeader({ name: 'x-store-id', required: true, description: 'ID của cửa hàng' })
@Controller('store-bookings')
export class StoreBookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // calendar MUST be before the root @Get() to avoid route conflict
  @Get('calendar')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  @ApiOperation({
    summary: 'Xem lịch hẹn theo tháng (dạng calendar)',
    description:
      'Trả về danh sách lịch hẹn của cửa hàng trong một tháng cụ thể, dùng để hiển thị calendar. Store ID lấy từ header x-store-id.',
  })
  @ApiResponse({ status: 200, description: 'Dữ liệu lịch hẹn theo tháng' })
  @ApiResponse({
    status: 400,
    description: 'Tháng không đúng định dạng YYYY-MM',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền xem lịch hẹn' })
  getCalendar(@StoreId() storeId: string, @Query() query: CalendarQueryDto) {
    return this.bookingsService.findCalendar(
      storeId,
      query.month,
      query.status,
      query.staffId,
    );
  }

  @Get(':id')
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  @ApiOperation({
    summary: 'Xem chi tiết lịch hẹn của cửa hàng',
    description: 'Lấy chi tiết một lịch hẹn thuộc cửa hàng. Store ID lấy từ header x-store-id.',
  })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn' })
  @ApiResponse({ status: 200, description: 'Chi tiết lịch hẹn' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  findOne(@Param('id') id: string, @StoreId() storeId: string) {
    return this.bookingsService.findOneForStore(id, storeId);
  }

  @Get()
  @RequirePermissions(Permissions.APPOINTMENT.VIEW)
  @ApiOperation({
    summary: 'Danh sách lịch hẹn của cửa hàng',
    description:
      'Lấy danh sách lịch hẹn có phân trang và bộ lọc. Store ID lấy từ header x-store-id.',
  })
  @ApiResponse({ status: 200, description: 'Danh sách lịch hẹn có phân trang' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem lịch hẹn' })
  findAll(@StoreId() storeId: string, @Query() filter: BookingFilterDto) {
    return this.bookingsService.findStoreBookings(storeId, filter);
  }

  @Patch(':id/confirm')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  @AuditLog({ type: LogType.BOOKING_CONFIRMED, targetType: 'Booking' })
  @ApiOperation({
    summary: 'Xác nhận lịch hẹn',
    description:
      'Cửa hàng xác nhận lịch hẹn của khách. Chỉ áp dụng cho lịch hẹn đang ở trạng thái PENDING.',
  })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn cần xác nhận' })
  @ApiResponse({ status: 200, description: 'Xác nhận lịch hẹn thành công' })
  @ApiResponse({
    status: 400,
    description: 'Lịch hẹn không ở trạng thái PENDING',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền xác nhận lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.bookingsService.confirm(id, user.id, ip);
  }

  @Patch(':id/reject')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  @AuditLog({ type: LogType.BOOKING_REJECTED, targetType: 'Booking' })
  @ApiOperation({
    summary: 'Từ chối lịch hẹn',
    description:
      'Cửa hàng từ chối lịch hẹn của khách. Bắt buộc cung cấp lý do từ chối.',
  })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn cần từ chối' })
  @ApiResponse({ status: 200, description: 'Từ chối lịch hẹn thành công' })
  @ApiResponse({
    status: 400,
    description: 'Lịch hẹn không thể từ chối ở trạng thái hiện tại',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền từ chối lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectBookingDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.bookingsService.reject(id, user.id, dto.reason, ip);
  }

  @Post(':id/record-payment')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  @ApiOperation({
    summary: 'Ghi nhận thanh toán tại cửa hàng',
    description:
      'CASH: ghi nhận tiền mặt ngay lập tức, cập nhật trạng thái booking. ' +
      'SEPAY: tạo QR chuyển khoản cho khách quét tại chỗ — webhook tự động xác nhận khi tiền về.',
  })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn' })
  @ApiResponse({ status: 201, description: 'Ghi nhận thành công (CASH) hoặc QR data (SEPAY)' })
  @ApiResponse({ status: 400, description: 'Lịch hẹn không ở trạng thái có thể thanh toán' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  recordPayment(
    @Param('id') id: string,
    @StoreId() storeId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RecordStorePaymentDto,
  ) {
    return this.paymentsService.recordStorePayment(id, storeId, user.id, dto.method, dto.paymentType);
  }

  @Patch(':id/complete')
  @RequirePermissions(Permissions.APPOINTMENT.UPDATE)
  @AuditLog({ type: LogType.BOOKING_COMPLETED, targetType: 'Booking' })
  @ApiOperation({
    summary: 'Hoàn thành lịch hẹn',
    description:
      'Đánh dấu lịch hẹn đã hoàn thành sau khi khách đã sử dụng dịch vụ.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID của lịch hẹn cần đánh dấu hoàn thành',
  })
  @ApiResponse({
    status: 200,
    description: 'Lịch hẹn được đánh dấu hoàn thành',
  })
  @ApiResponse({
    status: 400,
    description: 'Lịch hẹn không ở trạng thái CONFIRMED',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền cập nhật lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  complete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.bookingsService.complete(id, user.id, ip);
  }
}
