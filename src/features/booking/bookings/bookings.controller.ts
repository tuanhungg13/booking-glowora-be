import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { BookingsService } from './bookings.service';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MyBookingFilterDto } from './dto/my-booking-filter.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo lịch hẹn mới', description: 'Khách hàng đặt lịch dịch vụ tại cửa hàng. Chủ shop và nhân viên không thể đặt lịch tại cơ sở của mình.' })
  @ApiResponse({ status: 201, description: 'Tạo lịch hẹn thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc slot đã bị đặt' })
  @ApiResponse({ status: 403, description: 'Chủ shop / nhân viên không thể đặt lịch tại cơ sở của mình' })
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.bookingsService.create(dto, user.id, ip);
  }

  // MUST be before :id to avoid route conflict
  @Get('my')
  @ApiOperation({ summary: 'Lấy danh sách lịch hẹn của tôi', description: 'Trả về lịch hẹn của người dùng đang đăng nhập, có thể lọc theo trạng thái, khoảng ngày và phân trang.' })
  @ApiResponse({ status: 200, description: 'Danh sách lịch hẹn của người dùng' })
  findMy(@CurrentUser() user: CurrentUserPayload, @Query() filter: MyBookingFilterDto) {
    return this.bookingsService.findMy(user.id, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết lịch hẹn', description: 'Lấy thông tin chi tiết một lịch hẹn theo ID.' })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn' })
  @ApiResponse({ status: 200, description: 'Chi tiết lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.findOneForUser(id, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Hủy lịch hẹn', description: 'Khách hàng hủy lịch hẹn của mình. Chỉ hủy được khi lịch chưa được xác nhận hoặc đang chờ xử lý.' })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn cần hủy' })
  @ApiResponse({ status: 200, description: 'Hủy lịch hẹn thành công' })
  @ApiResponse({ status: 400, description: 'Lịch hẹn không thể hủy ở trạng thái hiện tại' })
  @ApiResponse({ status: 403, description: 'Không có quyền hủy lịch hẹn này' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.bookingsService.cancel(id, user.id, dto.reason, ip);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.APPOINTMENT.DELETE)
  @ApiOperation({ summary: 'Xóa lịch hẹn', description: 'Xóa vĩnh viễn một lịch hẹn đã hủy hoặc bị từ chối. Yêu cầu quyền APPOINTMENT.DELETE.' })
  @ApiParam({ name: 'id', description: 'ID của lịch hẹn cần xóa' })
  @ApiResponse({ status: 200, description: 'Xóa lịch hẹn thành công' })
  @ApiResponse({ status: 400, description: 'Lịch hẹn chưa hủy/bị từ chối nên không thể xóa vĩnh viễn' })
  @ApiResponse({ status: 403, description: 'Không có quyền xóa lịch hẹn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch hẹn' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.bookingsService.remove(id, user.id, ip);
  }
}
