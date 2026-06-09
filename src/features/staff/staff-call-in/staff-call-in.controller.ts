import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CallInStatus } from '@prisma/client';
import { StaffCallInService } from './staff-call-in.service';
import { CreateStaffCallInDto } from './dto/create-staff-call-in.dto';
import { RespondStaffCallInDto } from './dto/respond-staff-call-in.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';

@ApiTags('staff / call-in')
@ApiBearerAuth()
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@Controller('staff/:staffId/call-in')
export class StaffCallInController {
  constructor(private readonly staffCallInService: StaffCallInService) {}

  @ApiOperation({ summary: 'Quản lý gọi nhân viên đi làm ngày trống' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @Post()
  @RequirePermissions(Permissions.STAFF_CALL_IN.CREATE)
  create(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateStaffCallInDto,
  ) {
    return this.staffCallInService.create(storeId, staffId, dto);
  }

  @ApiOperation({ summary: 'Danh sách yêu cầu gọi đi làm' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'status', required: false, enum: CallInStatus })
  @Get()
  @RequirePermissions(Permissions.STAFF_CALL_IN.VIEW)
  findAll(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: CallInStatus,
  ) {
    return this.staffCallInService.findAll(storeId, staffId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status,
    });
  }

  @ApiOperation({ summary: 'Nhân viên chấp nhận / từ chối yêu cầu' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'CallIn ID' })
  @Patch(':id/respond')
  @RequirePermissions(Permissions.STAFF_CALL_IN.RESPOND)
  respond(
    @Param('staffId') staffId: string,
    @Param('id') id: string,
    @Body() dto: RespondStaffCallInDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.staffCallInService.respond(staffId, id, req.user.id, dto.action);
  }

  @ApiOperation({ summary: 'Hủy yêu cầu gọi đi làm (chỉ PENDING)' })
  @ApiParam({ name: 'staffId', description: 'Staff ID' })
  @ApiParam({ name: 'id', description: 'CallIn ID' })
  @Delete(':id')
  @RequirePermissions(Permissions.STAFF_CALL_IN.DELETE)
  remove(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
  ) {
    return this.staffCallInService.remove(storeId, staffId, id);
  }
}
