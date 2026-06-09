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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { DayOfWeek } from '@prisma/client';

@ApiTags('staff / schedules')
@ApiBearerAuth()
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@Controller('staff/:staffId/schedules')
export class StaffScheduleController {
  constructor(private readonly staffScheduleService: StaffScheduleService) {}

  @ApiOperation({ summary: 'Tạo lịch làm việc cho nhân viên' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @Post()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.CREATE)
  create(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateStaffScheduleDto,
  ) {
    return this.staffScheduleService.create(storeId, staffId, dto);
  }

  @ApiOperation({ summary: 'Bulk upsert lịch làm việc — lưu lịch cũ vào history, ghi đè lịch mới' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @Put()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.UPDATE)
  bulkUpsert(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: BulkUpsertScheduleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.staffScheduleService.bulkUpsert(storeId, staffId, dto.schedules, user.id);
  }

  @ApiOperation({ summary: 'Lấy lịch làm việc của nhân viên — truyền date quá khứ để xem lịch lịch sử' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({ name: 'dayOfWeek', enum: DayOfWeek, required: false })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD — ngày quá khứ: trả lịch lịch sử; hiện tại/tương lai hoặc bỏ trống: trả lịch hiện tại' })
  @Get()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.VIEW)
  findAll(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Query('dayOfWeek') dayOfWeek?: DayOfWeek,
    @Query('date') date?: string,
  ) {
    return this.staffScheduleService.findAll(storeId, staffId, dayOfWeek, date);
  }

  @ApiOperation({ summary: 'Xem lịch sử thay đổi lịch làm việc' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — lọc theo effectiveTo >= from' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date — lọc theo effectiveTo <= to' })
  @Get('history')
  @RequirePermissions(Permissions.STAFF_SCHEDULE.VIEW)
  findHistory(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.staffScheduleService.findHistory(storeId, staffId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @ApiOperation({ summary: 'Cập nhật một ca lịch cụ thể' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
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
