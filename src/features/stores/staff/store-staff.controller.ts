import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';
import { StoreStaffService } from './store-staff.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@ApiTags('stores/staff')
@ApiHeader({ name: 'x-store-id', required: true, description: 'ID của cửa hàng' })
@Controller('store-staff')
export class StoreStaffController {
  constructor(private readonly storeStaffService: StoreStaffService) { }

  @ApiOperation({ summary: 'List all staff of a store' })
  @Public()
  @Get()
  findAll(@StoreId() storeId: string) {
    return this.storeStaffService.findAllPublic(storeId);
  }

  @ApiOperation({ summary: 'Calendar tổng quan lịch làm việc toàn nhân viên' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STAFF.VIEW)
  @Get('calendar')
  getCalendar(
    @StoreId() storeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.storeStaffService.getCalendar(storeId, from, to);
  }

  @ApiOperation({ summary: 'Lịch làm việc trong ngày — slot config + trạng thái nhân viên + lịch hẹn' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STAFF.VIEW)
  @Get('daily')
  getDailyTimeline(
    @StoreId() storeId: string,
    @Query('date') date: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.storeStaffService.getDailyTimeline(storeId, date, staffId);
  }

  @ApiOperation({ summary: 'Get current user staff profile for this store' })
  @ApiBearerAuth()
  @Get('me')
  getMyProfile(
    @StoreId() storeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storeStaffService.getMyProfile(storeId, user.id);
  }

  @ApiOperation({ summary: 'Get staff detail' })
  @Public()
  @Get(':staffId')
  findOne(@StoreId() storeId: string, @Param('staffId') staffId: string) {
    return this.storeStaffService.findOnePublic(storeId, staffId);
  }

  @ApiOperation({ summary: 'Invite a user to become staff' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STAFF.INVITE)
  @Post('invite')
  invite(
    @StoreId() storeId: string,
    @Body() dto: InviteStaffDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storeStaffService.invite(storeId, user.id, dto);
  }

  @ApiOperation({ summary: 'Update staff profile (specialty, bio, status)' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STAFF.UPDATE)
  @Patch(':staffId')
  update(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storeStaffService.update(storeId, user.id, staffId, dto);
  }

  @ApiOperation({ summary: 'Deactivate staff and revoke store role' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STAFF.REMOVE)
  @Delete(':staffId')
  remove(
    @StoreId() storeId: string,
    @Param('staffId') staffId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storeStaffService.remove(storeId, user.id, staffId);
  }
}

@ApiTags('staff-invites')
@Controller('staff-invites')
export class StaffInvitesController {
  constructor(private readonly storeStaffService: StoreStaffService) { }

  @ApiOperation({ summary: 'Accept a staff invite using token' })
  @ApiBearerAuth()
  @Post('accept')
  accept(@Body() dto: AcceptInviteDto, @CurrentUser() user: CurrentUserPayload) {
    return this.storeStaffService.acceptInvite(dto, user.id);
  }
}
