import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StaffDayOffService } from './staff-day-off.service';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { UpdateStaffDayOffDto } from './dto/update-staff-day-off.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';

@ApiTags('staff / day-off')
@ApiBearerAuth()
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@Controller('staff/:staffId/day-off')
export class StaffDayOffController {
  constructor(private readonly staffDayOffService: StaffDayOffService) { }

  @ApiOperation({ summary: 'Đăng ký ngày nghỉ cho nhân viên' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @Post()
  @RequirePermissions(Permissions.STAFF_DAY_OFF.CREATE)
  create(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateStaffDayOffDto,
  ) {
    return this.staffDayOffService.create(storeId, staffId, dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách ngày nghỉ (có thể lọc theo khoảng thời gian)' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string — VD: 2025-01-01' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string — VD: 2025-01-31' })
  @ApiResponse({ status: 200, description: 'Danh sách ngày nghỉ' })
  @Get()
  @RequirePermissions(Permissions.STAFF_DAY_OFF.VIEW)
  findAll(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.staffDayOffService.findAll(storeId, staffId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @ApiOperation({ summary: 'Lấy chi tiết ngày nghỉ' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Day-off ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết ngày nghỉ' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy' })
  @Get(':id')
  @RequirePermissions(Permissions.STAFF_DAY_OFF.VIEW)
  findOne(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
  ) {
    return this.staffDayOffService.findOne(id, storeId, staffId);
  }

  @ApiOperation({ summary: 'Cập nhật ngày nghỉ' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Day-off ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Patch(':id')
  @RequirePermissions(Permissions.STAFF_DAY_OFF.UPDATE)
  update(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDayOffDto,
  ) {
    return this.staffDayOffService.update(id, storeId, staffId, dto);
  }

  @ApiOperation({ summary: 'Hủy ngày nghỉ' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Day-off ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @Delete(':id')
  @RequirePermissions(Permissions.STAFF_DAY_OFF.DELETE)
  remove(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
  ) {
    return this.staffDayOffService.remove(id, storeId, staffId);
  }
}
