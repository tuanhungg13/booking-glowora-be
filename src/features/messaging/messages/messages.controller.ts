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
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';

@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @RequirePermissions(Permissions.MESSAGE.CREATE)
  create(
    @Param('conversationId') conversationId: string,
    @Body() dto: Omit<CreateMessageDto, 'conversationId'>,
  ) {
    return this.messagesService.create({ ...dto, conversationId });
  }

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

  @Get(':id')
  @RequirePermissions(Permissions.MESSAGE.VIEW)
  findOne(@Param('id') id: string) {
    return this.messagesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.MESSAGE.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateMessageDto) {
    return this.messagesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.MESSAGE.DELETE)
  remove(@Param('id') id: string) {
    return this.messagesService.remove(id);
  }
}
