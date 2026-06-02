import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateStoreCategoryDto } from './dto/create-store-category.dto';
import { UpdateStoreCategoryDto } from './dto/update-store-category.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';

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

  @ApiOperation({
    summary: 'Chi tiết danh mục hệ thống kèm danh mục con (public)',
  })
  @ApiParam({ name: 'id', description: 'Category ID hoặc slug' })
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  // Store categories (level 2)

  @ApiOperation({ summary: 'Tạo danh mục riêng của store (store owner)' })
  @ApiHeader({ name: 'x-store-id', required: true })
  @ApiBearerAuth()
  @Post('store')
  @RequirePermissions(Permissions.CATEGORY.CREATE)
  createStoreCategory(
    @StoreId() storeId: string,
    @Body() dto: CreateStoreCategoryDto,
  ) {
    return this.categoriesService.createStoreCategory(storeId, dto);
  }

  @ApiOperation({ summary: 'Danh sách danh mục của store (store owner)' })
  @ApiHeader({ name: 'x-store-id', required: true })
  @ApiBearerAuth()
  @Get('store/list')
  @RequirePermissions(Permissions.CATEGORY.VIEW)
  findStoreCategories(@StoreId() storeId: string) {
    return this.categoriesService.findStoreCategories(storeId);
  }

  @ApiOperation({ summary: 'Cập nhật danh mục của store (store owner)' })
  @ApiHeader({ name: 'x-store-id', required: true })
  @ApiBearerAuth()
  @ApiParam({ name: 'id' })
  @Patch('store/:id')
  @RequirePermissions(Permissions.CATEGORY.UPDATE)
  updateStoreCategory(
    @StoreId() storeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStoreCategoryDto,
  ) {
    return this.categoriesService.updateStoreCategory(id, storeId, dto);
  }

  @ApiOperation({ summary: 'Xóa danh mục của store (store owner)' })
  @ApiHeader({ name: 'x-store-id', required: true })
  @ApiBearerAuth()
  @ApiParam({ name: 'id' })
  @Delete('store/:id')
  @RequirePermissions(Permissions.CATEGORY.DELETE)
  removeStoreCategory(@StoreId() storeId: string, @Param('id') id: string) {
    return this.categoriesService.removeStoreCategory(id, storeId);
  }
}
