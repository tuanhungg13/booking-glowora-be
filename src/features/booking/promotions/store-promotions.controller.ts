import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PromotionFilterDto } from './dto/promotion-filter.dto';

@ApiTags('store-promotions')
@Controller('stores/:storeId/promotions')
export class StorePromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @ApiBearerAuth()
  @RequirePermissions(Permissions.PROMOTION.CREATE)
  @ApiOperation({ summary: 'Tạo chương trình khuyến mãi cho cửa hàng' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  create(
    @Param('storeId') storeId: string,
    @Body() dto: CreatePromotionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.promotionsService.create(dto, user.id, storeId);
  }

  @Get()
  @ApiBearerAuth()
  @RequirePermissions(Permissions.PROMOTION.VIEW)
  @ApiOperation({ summary: 'Danh sách promotion của cửa hàng (store owner)' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  findAll(@Param('storeId') storeId: string, @Query() filter: PromotionFilterDto) {
    return this.promotionsService.findAll(storeId, filter);
  }

  @Get('active')
  @Public()
  @ApiOperation({ summary: 'Promotion đang chạy của cửa hàng (public)' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  findActive(@Param('storeId') storeId: string) {
    return this.promotionsService.findActiveForStore(storeId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @RequirePermissions(Permissions.PROMOTION.VIEW)
  @ApiOperation({ summary: 'Chi tiết promotion' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  @ApiParam({ name: 'id', description: 'ID promotion' })
  findOne(@Param('id') id: string, @Param('storeId') storeId: string) {
    return this.promotionsService.findOne(id, storeId);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @RequirePermissions(Permissions.PROMOTION.UPDATE)
  @ApiOperation({ summary: 'Cập nhật promotion (isActive, endAt, name, description)' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  @ApiParam({ name: 'id', description: 'ID promotion' })
  update(
    @Param('id') id: string,
    @Param('storeId') storeId: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.promotionsService.update(id, storeId, dto, user.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @RequirePermissions(Permissions.PROMOTION.DELETE)
  @ApiOperation({ summary: 'Xóa promotion' })
  @ApiParam({ name: 'storeId', description: 'ID cửa hàng' })
  @ApiParam({ name: 'id', description: 'ID promotion' })
  remove(
    @Param('id') id: string,
    @Param('storeId') storeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.promotionsService.remove(id, storeId, user.id);
  }
}
