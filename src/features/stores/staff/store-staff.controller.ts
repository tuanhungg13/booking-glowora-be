import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreStaffService } from './store-staff.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@ApiTags('stores/staff')
@Controller('stores/:storeId/staff')
export class StoreStaffController {
  constructor(private readonly storeStaffService: StoreStaffService) {}

  @ApiOperation({ summary: 'List all staff of a store' })
  @Public()
  @Get()
  findAll(@Param('storeId') storeId: string) {
    return this.storeStaffService.findAll(storeId);
  }

  @ApiOperation({ summary: 'Get staff detail' })
  @Public()
  @Get(':staffId')
  findOne(@Param('storeId') storeId: string, @Param('staffId') staffId: string) {
    return this.storeStaffService.findOne(storeId, staffId);
  }

  @ApiOperation({ summary: 'Invite a user to become staff' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STAFF.INVITE)
  @Post('invite')
  invite(
    @Param('storeId') storeId: string,
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
    @Param('storeId') storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storeStaffService.update(storeId, user.id, staffId, dto);
  }

  @ApiOperation({ summary: 'Deactivate staff and revoke shop role' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STAFF.REMOVE)
  @Delete(':staffId')
  remove(
    @Param('storeId') storeId: string,
    @Param('staffId') staffId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storeStaffService.remove(storeId, user.id, staffId);
  }
}

@ApiTags('staff-invites')
@Controller('staff-invites')
export class StaffInvitesController {
  constructor(private readonly storeStaffService: StoreStaffService) {}

  @ApiOperation({ summary: 'Accept a staff invite using token' })
  @ApiBearerAuth()
  @Post('accept')
  accept(@Body() dto: AcceptInviteDto, @CurrentUser() user: CurrentUserPayload) {
    return this.storeStaffService.acceptInvite(dto, user.id);
  }
}
