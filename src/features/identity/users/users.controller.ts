import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { UserStatus } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Tạo user mới (admin)' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền' })
  @Post()
  @RequirePermissions(Permissions.USER.CREATE)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách user (admin)' })
  @ApiQuery({ name: 'status', enum: UserStatus, required: false, description: 'Lọc theo trạng thái user' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Tìm theo tên hoặc email' })
  @ApiQuery({ name: 'skip', required: false, type: Number, description: 'Số bản ghi bỏ qua' })
  @ApiQuery({ name: 'take', required: false, type: Number, description: 'Số bản ghi lấy về' })
  @ApiResponse({ status: 200, description: 'Danh sách user' })
  @Get()
  @RequirePermissions(Permissions.USER.VIEW)
  findAll(
    @Query('status') status?: UserStatus,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.usersService.findAll({
      status,
      q,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Patch('me')
  updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @ApiOperation({ summary: 'Lấy chi tiết user theo ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết user' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy user' })
  @Get(':id')
  @RequirePermissions(Permissions.USER.VIEW)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật user (admin)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy user' })
  @Patch(':id')
  @RequirePermissions(Permissions.USER.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa user (admin)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy user' })
  @Delete(':id')
  @RequirePermissions(Permissions.USER.DELETE)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
