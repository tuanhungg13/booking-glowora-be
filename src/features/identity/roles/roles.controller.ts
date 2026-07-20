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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { CurrentUser, type CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @ApiOperation({ summary: 'Tạo role mới' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền' })
  @Post()
  @RequirePermissions(Permissions.ROLE.CREATE)
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.rolesService.create(dto, user.id);
  }

  @ApiOperation({ summary: 'Lấy danh sách tất cả role' })
  @ApiResponse({ status: 200, description: 'Danh sách role' })
  @Get()
  @RequirePermissions(Permissions.ROLE.VIEW)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.rolesService.findAll(user.id);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết role' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy role' })
  @Get(':id')
  @RequirePermissions(Permissions.ROLE.VIEW)
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.rolesService.findOne(id, user.id);
  }

  @ApiOperation({ summary: 'Cập nhật role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy role' })
  @Patch(':id')
  @RequirePermissions(Permissions.ROLE.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.rolesService.update(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Xóa role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy role' })
  @Delete(':id')
  @RequirePermissions(Permissions.ROLE.DELETE)
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.rolesService.remove(id, user.id);
  }
}
