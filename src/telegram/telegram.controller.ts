import { Body, Controller, Inject, Logger, Post, forwardRef } from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConversationsService } from '../features/messaging/conversations/conversations.service';
import { ChatGateway } from '../gateways/chat.gateway';

@ApiExcludeController()
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversations: ConversationsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  @Public()
  @Post('webhook')
  async handleWebhook(@Body() update: any) {
    const message = update?.message;
    if (message?.chat) {
      this.logger.log(
        `[webhook] chat.id=${message.chat.id} chat.type=${message.chat.type} chat.title="${message.chat.title ?? 'DM'}"`,
      );
    }
    if (!message?.text) return { ok: true };

    const text: string = message.text;
    const threadId: number | undefined = message.message_thread_id;

    // /start <token> — link staff (DM) hoặc setup group store (supergroup)
    if (text.startsWith('/start ')) {
      const token = text.split(' ')[1]?.trim();
      if (token) {
        if (message.chat.type === 'private') {
          await this.handleLinkToken(String(message.chat.id), token);
        } else {
          await this.handleGroupSetupToken(String(message.chat.id), token);
        }
      }
      return { ok: true };
    }

    if (threadId) {
      // Reply trong group topic
      await this.handleGroupTopicReply(message, threadId, text);
    } else {
      // DM từ staff (fallback mode)
      await this.handleDmReply(message, text);
    }

    return { ok: true };
  }

  // ─── Group topic reply ─────────────────────────────────────────────────────

  private async handleGroupTopicReply(message: any, threadId: number, text: string) {
    const groupId = String(message.chat.id);
    const senderChatId = String(message.from.id);

    this.logger.log(`[handleGroupTopicReply] groupId=${groupId} threadId=${threadId} senderChatId=${senderChatId}`);

    const conversationId = await this.redis.get(`telegram:topic:${groupId}:${threadId}`);
    if (!conversationId) {
      this.logger.warn(`[handleGroupTopicReply] No Redis key for telegram:topic:${groupId}:${threadId} — message dropped`);
      return;
    }

    this.logger.log(`[handleGroupTopicReply] conversationId=${conversationId}`);

    try {
      const msg = await this.conversations.handleStaffReply(conversationId, senderChatId, text);
      if (msg) {
        this.chatGateway.emitToConversation(conversationId, 'message_received', msg);
        this.logger.log(`[handleGroupTopicReply] ✅ Message emitted to WebSocket room conv:${conversationId}`);
      } else {
        this.logger.warn(`[handleGroupTopicReply] handleStaffReply returned null — message not emitted`);
      }
    } catch (err) {
      this.logger.error('Failed to handle group topic reply', err);
    }
  }

  // ─── DM reply (fallback) ───────────────────────────────────────────────────

  private async handleDmReply(message: any, text: string) {
    const chatId = String(message.chat.id);
    this.logger.log(`[handleDmReply] chatId=${chatId}`);

    const conversationId = await this.redis.get(`telegram:active:${chatId}`);
    if (!conversationId) {
      this.logger.warn(`[handleDmReply] No active conversation for chatId=${chatId}`);
      await this.telegram.sendConfirmation(
        chatId,
        '⚠️ Không có cuộc hội thoại nào đang hoạt động. Vui lòng chờ khách hàng nhắn tin trước.',
      );
      return;
    }

    this.logger.log(`[handleDmReply] conversationId=${conversationId}`);

    try {
      const msg = await this.conversations.handleStaffReply(conversationId, chatId, text);
      if (msg) {
        this.chatGateway.emitToConversation(conversationId, 'message_received', msg);
        this.logger.log(`[handleDmReply] ✅ Message emitted to WebSocket room conv:${conversationId}`);
      } else {
        this.logger.warn(`[handleDmReply] handleStaffReply returned null — message not emitted`);
      }
    } catch (err) {
      this.logger.error('Failed to handle DM reply', err);
    }
  }

  // ─── Group setup token ─────────────────────────────────────────────────────

  private async handleGroupSetupToken(groupId: string, token: string) {
    const storeId = await this.redis.get(`telegram:store-setup:${token}`);
    if (!storeId) {
      await this.telegram.sendConfirmation(groupId, '❌ Link không hợp lệ hoặc đã hết hạn (10 phút). Hãy tạo link mới từ ứng dụng.');
      return;
    }

    await this.prisma.store.update({
      where: { id: storeId },
      data: { telegramGroupId: groupId },
    });
    await this.redis.del(`telegram:store-setup:${token}`);

    this.logger.log(`[handleGroupSetupToken] Linked group ${groupId} → store ${storeId}`);

    await this.telegram.sendConfirmation(
      groupId,
      '✅ Nhóm đã kết nối với Glowora!\n\n' +
      '⚠️ Bước cuối: cấp quyền Admin cho bot để nhận tin nhắn từ khách hàng:\n' +
      'Thông tin nhóm → Quản trị viên → Thêm bot → tick ✅ Quản lý chủ đề',
    );
  }

  // ─── Link token ────────────────────────────────────────────────────────────

  private async handleLinkToken(chatId: string, token: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { telegramLinkToken: token },
      select: { id: true },
    });

    if (!staff) {
      await this.telegram.sendConfirmation(chatId, '❌ Token không hợp lệ hoặc đã hết hạn.');
      return;
    }

    await this.prisma.staff.update({
      where: { id: staff.id },
      data: { telegramChatId: chatId, telegramLinkToken: null },
    });

    await this.telegram.sendConfirmation(
      chatId,
      '✅ Tài khoản Telegram đã được liên kết thành công! Bạn sẽ nhận được thông báo khi khách hàng cần tư vấn.',
    );
  }
}
