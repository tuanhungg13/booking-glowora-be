import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { SlotsService } from './slots.service';
import { AvailableSlotsDto } from './dto/available-slots-query.dto';

@ApiTags('slots')
@Controller('stores/:storeId/available-slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Post()
  @Public()
  @ApiOperation({
    summary: 'Lấy các slot thời gian còn trống',
    description: 'Trả về danh sách các khung giờ còn trống của cửa hàng cho một ngày và dịch vụ cụ thể. Endpoint công khai, không cần đăng nhập.',
  })
  @ApiParam({ name: 'storeId', description: 'ID của cửa hàng' })
  @ApiResponse({ status: 200, description: 'Danh sách slot thời gian còn trống' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ (ngày sai định dạng, dịch vụ không tồn tại...)' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy cửa hàng' })
  getAvailableSlots(
    @Param('storeId') storeId: string,
    @Body() dto: AvailableSlotsDto,
  ) {
    return this.slotsService.getAvailableSlots(storeId, dto);
  }
}
