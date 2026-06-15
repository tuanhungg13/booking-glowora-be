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
import { SenderType } from '@prisma/client';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) { }

  @ApiOperation({ summary: 'Tạo cuộc hội thoại mới' })
  @ApiBearerAuth()
  @Post()
  create(@Body() dto: CreateConversationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.conversationsService.create(dto.storeId, user.id);
  }

  @ApiOperation({ summary: 'Lấy danh sách tất cả hội thoại (admin)' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Lọc theo khách hàng' })
  @ApiQuery({ name: 'storeId', required: false, description: 'Lọc theo store' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiBearerAuth()
  @Get()
  @RequirePermissions(Permissions.CONVERSATION.VIEW)
  findAll(
    @Query('customerId') customerId?: string,
    @Query('storeId') storeId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.conversationsService.findAll({
      customerId,
      storeId,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @ApiOperation({ summary: 'Lấy danh sách hội thoại của tôi (customer)' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiBearerAuth()
  @Get('my')
  findMy(
    @CurrentUser() user: CurrentUserPayload,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.conversationsService.findAll({
      customerId: user.id,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      callerSenderType: SenderType.CUSTOMER,
    });
  }

  @ApiOperation({ summary: 'Lấy danh sách hội thoại của store (owner/staff view)' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiHeader({ name: 'x-store-id', required: true, description: 'ID của cửa hàng' })
  @ApiBearerAuth()
  @Get('store')
  findByStore(
    @CurrentUser() user: CurrentUserPayload,
    @StoreId() storeId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.conversationsService.findByStore(user.id, storeId, {
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      callerSenderType: SenderType.STAFF,
    });
  }

  @ApiOperation({ summary: 'Đánh dấu tất cả tin nhắn chưa đọc trong hội thoại là đã đọc' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBearerAuth()
  @Patch(':id/mark-read')
  markAsRead(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.conversationsService.markAsRead(id, user.id);
  }

  @ApiOperation({ summary: 'Lấy chi tiết hội thoại' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBearerAuth()
  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.conversationsService.findOne(id, user.id);
  }

  @ApiOperation({ summary: 'Cập nhật thông tin hội thoại' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBearerAuth()
  @Patch(':id')
  @RequirePermissions(Permissions.CONVERSATION.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversationsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa hội thoại' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBearerAuth()
  @Delete(':id')
  @RequirePermissions(Permissions.CONVERSATION.DELETE)
  remove(@Param('id') id: string) {
    return this.conversationsService.remove(id);
  }
}
