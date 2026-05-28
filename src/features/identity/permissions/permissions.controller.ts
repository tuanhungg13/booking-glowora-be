import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @ApiOperation({ summary: 'Tạo permission mới' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền' })
  @Post()
  @RequirePermissions(Permissions.PERMISSION.CREATE)
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách tất cả permission' })
  @ApiResponse({ status: 200, description: 'Danh sách permission' })
  @Get()
  @RequirePermissions(Permissions.PERMISSION.VIEW)
  findAll() {
    return this.permissionsService.findAll();
  }

  @ApiOperation({ summary: 'Lấy chi tiết permission' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết permission' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy permission' })
  @Get(':id')
  @RequirePermissions(Permissions.PERMISSION.VIEW)
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật permission' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy permission' })
  @Patch(':id')
  @RequirePermissions(Permissions.PERMISSION.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa permission' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy permission' })
  @Delete(':id')
  @RequirePermissions(Permissions.PERMISSION.DELETE)
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(id);
  }
}
