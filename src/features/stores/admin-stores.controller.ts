import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LogType } from '@prisma/client';
import { Permissions } from '../../common/constants/permissions';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AdminStoreActionDto } from './dto/admin-store-action.dto';
import { AdminStoreFilterDto } from './dto/store-filter.dto';
import { AdminStoresService } from './admin-stores.service';

@ApiTags('admin/stores')
@ApiBearerAuth()
@Controller('admin/stores')
@RequirePermissions(Permissions.STORE.VIEW)
export class AdminStoresController {
  constructor(private readonly adminStoresService: AdminStoresService) {}

  @ApiOperation({ summary: 'System overview stats for admin' })
  @Get('stats')
  getStats() {
    return this.adminStoresService.getStats();
  }

  @ApiOperation({ summary: 'Admin listing for all stores' })
  @Get()
  findAll(@Query() filter: AdminStoreFilterDto) {
    return this.adminStoresService.findAll(filter);
  }

  @ApiOperation({ summary: 'Admin store detail' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminStoresService.findOne(id);
  }

  @ApiOperation({ summary: 'Approve a pending or inactive store' })
  @RequirePermissions(Permissions.STORE.APPROVE)
  @AuditLog({ type: LogType.STORE_APPROVED, targetType: 'Store' })
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.adminStoresService.approve(id, user.id, ip);
  }

  @ApiOperation({ summary: 'Reject a pending or inactive store' })
  @RequirePermissions(Permissions.STORE.APPROVE)
  @AuditLog({ type: LogType.STORE_REJECTED, targetType: 'Store' })
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: AdminStoreActionDto, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.adminStoresService.reject(id, dto, user.id, ip);
  }

  @ApiOperation({ summary: 'Lock an active store' })
  @RequirePermissions(Permissions.STORE.APPROVE)
  @AuditLog({ type: LogType.STORE_BANNED, targetType: 'Store' })
  @Patch(':id/lock')
  lock(@Param('id') id: string, @Body() dto: AdminStoreActionDto, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.adminStoresService.lock(id, dto, user.id, ip);
  }

  @ApiOperation({ summary: 'Unlock a banned store' })
  @RequirePermissions(Permissions.STORE.APPROVE)
  @AuditLog({ type: LogType.STORE_UNLOCKED, targetType: 'Store' })
  @Patch(':id/unlock')
  unlock(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.adminStoresService.unlock(id, user.id, ip);
  }
}
