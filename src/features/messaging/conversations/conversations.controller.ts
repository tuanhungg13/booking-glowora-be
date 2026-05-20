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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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

  @Post()
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.CREATE)
  create(@Body() dto: CreateConversationDto) {
    return this.conversationsService.create(dto);
  }

  @Get()
  @ApiBearerAuth()
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

  @ApiOperation({ summary: 'List conversations for a store (staff view)' })
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

  @Get(':id')
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.VIEW)
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversationsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Manually escalate conversation to human staff' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.UPDATE)
  @Patch(':id/escalate')
  escalate(@Param('id') id: string, @CurrentUser() _user: CurrentUserPayload) {
    return this.conversationsService.escalateToHuman(id);
  }

  @ApiOperation({ summary: 'Switch conversation back to bot mode' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.UPDATE)
  @Patch(':id/bot-mode')
  setBotMode(@Param('id') id: string) {
    return this.conversationsService.setBotMode(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @RequirePermissions(Permissions.CONVERSATION.DELETE)
  remove(@Param('id') id: string) {
    return this.conversationsService.remove(id);
  }
}
