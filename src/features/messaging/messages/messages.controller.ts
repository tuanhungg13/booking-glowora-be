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
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';

@ApiTags('conversations / messages')
@ApiBearerAuth()
@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @ApiOperation({ summary: 'Gửi tin nhắn trong hội thoại' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiResponse({ status: 201, description: 'Gửi thành công' })
  @Post()
  @RequirePermissions(Permissions.MESSAGE.CREATE)
  create(
    @Param('conversationId') conversationId: string,
    @Body() dto: Omit<CreateMessageDto, 'conversationId'>,
  ) {
    return this.messagesService.create({ ...dto, conversationId });
  }

  @ApiOperation({ summary: 'Lấy danh sách tin nhắn trong hội thoại (phân trang)' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Danh sách tin nhắn' })
  @Get()
  @RequirePermissions(Permissions.MESSAGE.VIEW)
  findAll(
    @Param('conversationId') conversationId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.messagesService.findAll(conversationId, {
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @ApiOperation({ summary: 'Lấy chi tiết tin nhắn' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết tin nhắn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tin nhắn' })
  @Get(':id')
  @RequirePermissions(Permissions.MESSAGE.VIEW)
  findOne(@Param('id') id: string) {
    return this.messagesService.findOne(id);
  }

  @ApiOperation({ summary: 'Chỉnh sửa tin nhắn' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @Patch(':id')
  @RequirePermissions(Permissions.MESSAGE.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateMessageDto) {
    return this.messagesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa tin nhắn' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @Delete(':id')
  @RequirePermissions(Permissions.MESSAGE.DELETE)
  remove(@Param('id') id: string) {
    return this.messagesService.remove(id);
  }
}
