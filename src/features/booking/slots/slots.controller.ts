import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SlotsService } from './slots.service';
import { AvailableSlotsDto } from './dto/available-slots-query.dto';
import { AvailableStaffQueryDto } from './dto/available-staff-query.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('slots')
@Controller('stores/:storeId')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Post('available-slots')
  @ApiOperation({
    summary: 'Lấy các slot thời gian còn trống',
    description: 'Trả về danh sách các khung giờ còn trống của cửa hàng cho một ngày và dịch vụ cụ thể. Yêu cầu đăng nhập.',
  })
  @ApiParam({ name: 'storeId', description: 'ID của cửa hàng' })
  @ApiResponse({ status: 200, description: 'Danh sách slot thời gian còn trống' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ (ngày sai định dạng, dịch vụ không tồn tại...)' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy cửa hàng' })
  getAvailableSlots(
    @Param('storeId') storeId: string,
    @Body() dto: AvailableSlotsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.slotsService.getAvailableSlots(storeId, dto, user.id);
  }

  @Post('available-staff')
  @ApiOperation({
    summary: 'Lấy danh sách nhân viên khả dụng',
    description: 'Trả về danh sách nhân viên có thể thực hiện các dịch vụ đã chọn vào ngày được chỉ định. Yêu cầu đăng nhập.',
  })
  @ApiParam({ name: 'storeId', description: 'ID của cửa hàng' })
  @ApiResponse({ status: 200, description: 'Danh sách nhân viên khả dụng theo từng dịch vụ' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy cửa hàng hoặc dịch vụ' })
  getAvailableStaff(
    @Param('storeId') storeId: string,
    @Body() dto: AvailableStaffQueryDto,
  ) {
    return this.slotsService.getAvailableStaff(storeId, dto);
  }
}
