import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateShopCategoryDto } from './dto/create-shop-category.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ── Admin: danh mục hệ thống ───────────────────────────────────────────────

  @ApiOperation({ summary: 'Tạo danh mục hệ thống (admin)' })
  @ApiBearerAuth()
  @Post()
  @RequirePermissions(Permissions.CATEGORY.CREATE)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @ApiOperation({ summary: 'Cập nhật danh mục hệ thống (admin)' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id' })
  @Patch(':id')
  @RequirePermissions(Permissions.CATEGORY.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa danh mục hệ thống (admin)' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id' })
  @Delete(':id')
  @RequirePermissions(Permissions.CATEGORY.DELETE)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  // ── Public: danh mục hệ thống ─────────────────────────────────────────────

  @ApiOperation({ summary: 'Danh sách danh mục hệ thống (public)' })
  @Public()
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @ApiOperation({ summary: 'Chi tiết danh mục hệ thống kèm danh mục con (public)' })
  @ApiParam({ name: 'id', description: 'Category ID hoặc slug' })
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  // ── Shop: danh mục của shop (cấp 2) ───────────────────────────────────────

  @ApiOperation({ summary: 'Tạo danh mục riêng của shop (shop owner)' })
  @ApiHeader({ name: 'x-shop-id', required: true })
  @ApiBearerAuth()
  @Post('shop')
  @RequirePermissions(Permissions.CATEGORY.CREATE)
  createShopCategory(@ShopId() shopId: string, @Body() dto: CreateShopCategoryDto) {
    return this.categoriesService.createShopCategory(shopId, dto);
  }

  @ApiOperation({ summary: 'Danh sách danh mục của shop (shop owner)' })
  @ApiHeader({ name: 'x-shop-id', required: true })
  @ApiBearerAuth()
  @Get('shop/list')
  @RequirePermissions(Permissions.CATEGORY.VIEW)
  findShopCategories(@ShopId() shopId: string) {
    return this.categoriesService.findShopCategories(shopId);
  }

  @ApiOperation({ summary: 'Xóa danh mục của shop (shop owner)' })
  @ApiHeader({ name: 'x-shop-id', required: true })
  @ApiBearerAuth()
  @ApiParam({ name: 'id' })
  @Delete('shop/:id')
  @RequirePermissions(Permissions.CATEGORY.DELETE)
  removeShopCategory(@ShopId() shopId: string, @Param('id') id: string) {
    return this.categoriesService.removeShopCategory(id, shopId);
  }
}
