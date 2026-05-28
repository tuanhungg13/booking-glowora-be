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
import { CombosService } from './combos.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';
import { ComboStatus } from '@prisma/client';

@ApiTags('combos')
@ApiHeader({ name: 'x-shop-id', description: 'ID của shop', required: true })
@Controller('combos')
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @ApiOperation({ summary: 'Tạo combo dịch vụ mới' })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền' })
  @Post()
  @RequirePermissions(Permissions.COMBO.CREATE)
  create(@ShopId() storeId: string, @Body() dto: CreateComboDto) {
    return this.combosService.create(storeId, dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách combo của shop (public)' })
  @ApiQuery({ name: 'status', enum: ComboStatus, required: false, description: 'Lọc theo trạng thái combo' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Lọc theo danh mục' })
  @ApiResponse({ status: 200, description: 'Danh sách combo' })
  @Public()
  @Get()
  findAll(
    @ShopId() storeId: string,
    @Query('status') status?: ComboStatus,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.combosService.findAll({ storeId, status, categoryId });
  }

  @ApiOperation({ summary: 'Lấy chi tiết combo (public)' })
  @ApiParam({ name: 'id', description: 'Combo ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết combo' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy combo' })
  @Public()
  @Get(':id')
  findOne(@ShopId() storeId: string, @Param('id') id: string) {
    return this.combosService.findOne(id, storeId);
  }

  @ApiOperation({ summary: 'Cập nhật combo' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Combo ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy combo' })
  @Patch(':id')
  @RequirePermissions(Permissions.COMBO.UPDATE)
  update(
    @ShopId() storeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateComboDto,
  ) {
    return this.combosService.update(id, storeId, dto);
  }

  @ApiOperation({ summary: 'Xóa combo' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Combo ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy combo' })
  @Delete(':id')
  @RequirePermissions(Permissions.COMBO.DELETE)
  remove(@ShopId() storeId: string, @Param('id') id: string) {
    return this.combosService.remove(id, storeId);
  }
}
