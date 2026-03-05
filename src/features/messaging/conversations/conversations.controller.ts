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
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ConversationStatus } from '@prisma/client';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @RequirePermissions(Permissions.CONVERSATION.CREATE)
  create(@Body() dto: CreateConversationDto) {
    return this.conversationsService.create(dto);
  }

  @Get()
  @RequirePermissions(Permissions.CONVERSATION.VIEW)
  findAll(
    @Query('status') status?: ConversationStatus,
    @Query('customerId') customerId?: string,
    @Query('staffId') staffId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.conversationsService.findAll({
      status,
      customerId,
      staffId,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.CONVERSATION.VIEW)
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CONVERSATION.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversationsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.CONVERSATION.DELETE)
  remove(@Param('id') id: string) {
    return this.conversationsService.remove(id);
  }
}
