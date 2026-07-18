import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CouponFilterDto } from './dto/coupon-filter.dto';

@ApiTags('admin-coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @RequirePermissions(Permissions.COUPON.MANAGE)
  @ApiOperation({ summary: '[Admin] Tạo coupon platform-wide (áp dụng mọi cửa hàng)' })
  @ApiResponse({ status: 201, description: 'Coupon platform đã được tạo' })
  create(@Body() dto: CreateCouponDto, @CurrentUser() user: CurrentUserPayload) {
    return this.couponsService.create(dto, user.id, null);
  }

  @Get()
  @RequirePermissions(Permissions.COUPON.MANAGE)
  @ApiOperation({ summary: '[Admin] Danh sách tất cả coupon' })
  findAll(@Query() filter: CouponFilterDto) {
    return this.couponsService.findAll(filter, null, true);
  }

  @Get(':id')
  @RequirePermissions(Permissions.COUPON.MANAGE)
  @ApiOperation({ summary: '[Admin] Chi tiết coupon' })
  @ApiParam({ name: 'id', description: 'ID coupon' })
  findOne(@Param('id') id: string) {
    return this.couponsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.COUPON.MANAGE)
  @ApiOperation({ summary: '[Admin] Cập nhật coupon platform' })
  @ApiParam({ name: 'id', description: 'ID coupon' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // actorStoreId = undefined → admin bypass storeId check
    return this.couponsService.update(id, dto, user.id, undefined);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.COUPON.MANAGE)
  @ApiOperation({ summary: '[Admin] Xóa coupon platform' })
  @ApiParam({ name: 'id', description: 'ID coupon' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.couponsService.remove(id, user.id, undefined);
  }
}
