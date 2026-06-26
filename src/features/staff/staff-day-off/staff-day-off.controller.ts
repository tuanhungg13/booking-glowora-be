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
import { DayOffStatus } from '@prisma/client';
import { StaffDayOffService } from './staff-day-off.service';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { UpdateStaffDayOffDto } from './dto/update-staff-day-off.dto';
import { ReviewStaffDayOffDto } from './dto/review-staff-day-off.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('staff / day-off')
@ApiBearerAuth()
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@Controller('staff/:staffId/day-off')
export class StaffDayOffController {
  constructor(private readonly staffDayOffService: StaffDayOffService) {}

  @ApiOperation({ summary: 'Đăng ký ngày nghỉ cho nhân viên' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @Post()
  @RequirePermissions(Permissions.STAFF_DAY_OFF.CREATE)
  create(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateStaffDayOffDto,
  ) {
    return this.staffDayOffService.create(storeId, staffId, dto);
  }

  @ApiOperation({ summary: 'Duyệt hoặc từ chối yêu cầu nghỉ phép' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Day-off ID' })
  @Patch(':id/review')
  @RequirePermissions(Permissions.STAFF_DAY_OFF.REVIEW)
  review(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
    @Body() dto: ReviewStaffDayOffDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.staffDayOffService.review(id, storeId, staffId, user.id, dto.action, dto.note);
  }

  @ApiOperation({ summary: 'Lấy danh sách ngày nghỉ' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'status', required: false, enum: DayOffStatus })
  @Get()
  @RequirePermissions(Permissions.STAFF_DAY_OFF.VIEW)
  findAll(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: DayOffStatus,
  ) {
    return this.staffDayOffService.findAll(storeId, staffId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status,
    });
  }

  @ApiOperation({ summary: 'Lấy chi tiết ngày nghỉ' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Day-off ID' })
  @Get(':id')
  @RequirePermissions(Permissions.STAFF_DAY_OFF.VIEW)
  findOne(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
  ) {
    return this.staffDayOffService.findOne(id, storeId, staffId);
  }

  @ApiOperation({ summary: 'Cập nhật ngày nghỉ (chỉ khi PENDING)' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Day-off ID' })
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

  @ApiOperation({ summary: 'Nhân viên tự hủy yêu cầu nghỉ PENDING của mình' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Day-off ID' })
  @Delete(':id/cancel')
  cancelOwn(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.staffDayOffService.cancelOwn(id, storeId, staffId, user.id);
  }

  @ApiOperation({ summary: 'Hủy ngày nghỉ (không được hủy nếu đã APPROVED)' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'Day-off ID' })
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
