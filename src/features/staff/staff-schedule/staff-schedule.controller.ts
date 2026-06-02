import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StaffScheduleService } from './staff-schedule.service';
import { CreateStaffScheduleDto } from './dto/create-staff-schedule.dto';
import { UpdateStaffScheduleDto } from './dto/update-staff-schedule.dto';
import { BulkUpsertScheduleDto } from './dto/bulk-upsert-schedule.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';
import { DayOfWeek } from '@prisma/client';

@ApiTags('staff / schedules')
@ApiBearerAuth()
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@Controller('staff/:staffId/schedules')
export class StaffScheduleController {
  constructor(private readonly staffScheduleService: StaffScheduleService) { }

  @ApiOperation({ summary: 'Tạo lịch làm việc cho nhân viên' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @Post()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.CREATE)
  create(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateStaffScheduleDto,
  ) {
    return this.staffScheduleService.create(storeId, staffId, dto);
  }

  @ApiOperation({ summary: 'Bulk upsert lịch làm việc — ghi đè toàn bộ lịch của nhân viên' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Put()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.UPDATE)
  bulkUpsert(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: BulkUpsertScheduleDto,
  ) {
    return this.staffScheduleService.bulkUpsert(storeId, staffId, dto.schedules);
  }

  @ApiOperation({ summary: 'Lấy lịch làm việc của nhân viên' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({ name: 'dayOfWeek', enum: DayOfWeek, required: false, description: 'Lọc theo ngày trong tuần' })
  @ApiResponse({ status: 200, description: 'Danh sách lịch làm việc' })
  @Get()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.VIEW)
  findAll(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Query('dayOfWeek') dayOfWeek?: DayOfWeek,
  ) {
    return this.staffScheduleService.findAll(storeId, staffId, dayOfWeek);
  }

  @ApiOperation({ summary: 'Cập nhật một ca lịch cụ thể' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Patch(':id')
  @RequirePermissions(Permissions.STAFF_SCHEDULE.UPDATE)
  update(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffScheduleDto,
  ) {
    return this.staffScheduleService.update(id, storeId, staffId, dto);
  }

  @ApiOperation({ summary: 'Xóa một ca lịch cụ thể' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @Delete(':id')
  @RequirePermissions(Permissions.STAFF_SCHEDULE.DELETE)
  remove(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
  ) {
    return this.staffScheduleService.remove(id, storeId, staffId);
  }
}
