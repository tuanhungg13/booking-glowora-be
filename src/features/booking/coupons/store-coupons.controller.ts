import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuditLog } from '../../../common/decorators/audit-log.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CouponFilterDto } from './dto/coupon-filter.dto';
import { LogType } from '@prisma/client';

@ApiTags('store-coupons')
@ApiBearerAuth()
@Controller('stores/:storeId/coupons')
export class StoreCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @RequirePermissions(Permissions.COUPON.CREATE)
  @AuditLog({ type: LogType.COUPON_CREATED, targetType: 'Coupon' })
  @ApiOperation({ summary: 'Tạo coupon cho cửa hàng' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  @ApiResponse({ status: 201, description: 'Coupon đã được tạo' })
  create(
    @Param('storeId') storeId: string,
    @Body() dto: CreateCouponDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.couponsService.create(dto, user.id, storeId);
  }

  @Get()
  @RequirePermissions(Permissions.COUPON.VIEW)
  @ApiOperation({ summary: 'Danh sách coupon của cửa hàng (store owner)' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  findAll(@Param('storeId') storeId: string, @Query() filter: CouponFilterDto) {
    return this.couponsService.findAll(filter, storeId);
  }

  // Phải đặt trước /:id để NestJS không match "available" như một UUID
  @Get('available')
  @ApiOperation({
    summary: 'Danh sách coupon có thể dùng (customer)',
    description:
      'Trả về coupon đang active, còn hạn, chưa hết lượt — bao gồm coupon của store này và coupon platform-wide. Kèm `canUse` cho biết user còn lượt dùng không.',
  })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  findAvailable(
    @Param('storeId') storeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.couponsService.findAvailable(storeId, user.id);
  }

  @Get(':id')
  @RequirePermissions(Permissions.COUPON.VIEW)
  @ApiOperation({ summary: 'Chi tiết coupon' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  @ApiParam({ name: 'id', description: 'ID coupon' })
  findOne(@Param('id') id: string) {
    return this.couponsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.COUPON.UPDATE)
  @AuditLog({ type: LogType.COUPON_UPDATED, targetType: 'Coupon' })
  @ApiOperation({ summary: 'Cập nhật coupon (isActive, expiredAt)' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  @ApiParam({ name: 'id', description: 'ID coupon' })
  update(
    @Param('id') id: string,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.couponsService.update(id, dto, user.id, storeId);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.COUPON.DELETE)
  @AuditLog({ type: LogType.COUPON_DELETED, targetType: 'Coupon' })
  @ApiOperation({ summary: 'Xóa coupon (soft delete nếu đã dùng)' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  @ApiParam({ name: 'id', description: 'ID coupon' })
  remove(
    @Param('id') id: string,
    @Param('storeId') storeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.couponsService.remove(id, user.id, storeId);
  }
}
