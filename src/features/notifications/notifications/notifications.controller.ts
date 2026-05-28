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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { NotificationType } from '@prisma/client';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Tạo notification (system/admin)' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @Post()
  @RequirePermissions(Permissions.NOTIFICATION.CREATE)
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @ApiOperation({ summary: 'Lấy tất cả notifications (admin)' })
  @ApiQuery({ name: 'userId', required: false, description: 'Lọc theo user' })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean, description: 'Lọc theo trạng thái đọc' })
  @ApiQuery({ name: 'type', enum: NotificationType, required: false, description: 'Lọc theo loại notification' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Danh sách notifications' })
  @Get()
  @RequirePermissions(Permissions.NOTIFICATION.VIEW)
  findAll(
    @Query('userId') userId?: string,
    @Query('isRead') isRead?: string,
    @Query('type') type?: NotificationType,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.notificationsService.findAll({
      userId,
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      type,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @ApiOperation({ summary: 'Lấy notifications của user hiện tại' })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean, description: 'Lọc theo trạng thái đọc' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Danh sách notifications của tôi' })
  @Get('me')
  findMyNotifications(
    @CurrentUser() user: CurrentUserPayload,
    @Query('isRead') isRead?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.notificationsService.findAll({
      userId: user.id,
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @ApiOperation({ summary: 'Lấy số lượng notification chưa đọc' })
  @ApiResponse({ status: 200, description: 'Trả về { count: number }' })
  @Get('me/unread-count')
  getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @ApiOperation({ summary: 'Đánh dấu tất cả notification là đã đọc' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Patch('me/read-all')
  markAllAsRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @ApiOperation({ summary: 'Đánh dấu một notification là đã đọc' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Patch(':id/read')
  markOneAsRead(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markOneAsRead(id, user.id);
  }

  @ApiOperation({ summary: 'Lấy chi tiết notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết notification' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy' })
  @Get(':id')
  @RequirePermissions(Permissions.NOTIFICATION.VIEW)
  findOne(@Param('id') id: string) {
    return this.notificationsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật notification (admin)' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Patch(':id')
  @RequirePermissions(Permissions.NOTIFICATION.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateNotificationDto) {
    return this.notificationsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @Delete(':id')
  @RequirePermissions(Permissions.NOTIFICATION.DELETE)
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }
}
