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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { CurrentUser, type CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { ShopId } from '../../../common/decorators/shop-id.decorator';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @ApiOperation({ summary: 'Tạo cuộc hội thoại mới' })
  @ApiBearerAuth()
  @Post()
  @RequirePermissions(Permissions.CONVERSATION.CREATE)
  create(@Body() dto: CreateConversationDto) {
    return this.conversationsService.create(dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách tất cả hội thoại (admin)' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Lọc theo khách hàng' })
  @ApiQuery({ name: 'storeId', required: false, description: 'Lọc theo shop' })
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

  @ApiOperation({ summary: 'Lấy danh sách hội thoại của shop (staff view)' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.VIEW)
  @Get('store')
  findByStore(
    @ShopId() storeId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.conversationsService.findAll({
      storeId,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @ApiOperation({ summary: 'Lấy chi tiết hội thoại' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBearerAuth()
  @Get(':id')
  @RequirePermissions(Permissions.CONVERSATION.VIEW)
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật thông tin hội thoại' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBearerAuth()
  @Patch(':id')
  @RequirePermissions(Permissions.CONVERSATION.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversationsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Chuyển hội thoại sang nhân viên hỗ trợ thủ công' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.UPDATE)
  @Patch(':id/escalate')
  escalate(@Param('id') id: string, @CurrentUser() _user: CurrentUserPayload) {
    return this.conversationsService.escalateToHuman(id);
  }

  @ApiOperation({ summary: 'Chuyển hội thoại về chế độ bot tự động' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.UPDATE)
  @Patch(':id/bot-mode')
  setBotMode(@Param('id') id: string) {
    return this.conversationsService.setBotMode(id);
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
