import { Body, Controller, Inject, Logger, Post, forwardRef } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConversationsService } from '../features/messaging/conversations/conversations.service';
import { ChatGateway } from '../gateways/chat.gateway';

@ApiTags('telegram')
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
    if (!message?.text) return { ok: true };

    const text: string = message.text;
    const threadId: number | undefined = message.message_thread_id;

    // /start <token> — link staff Telegram account (chỉ xảy ra trong DM)
    if (text.startsWith('/start ')) {
      const token = text.split(' ')[1]?.trim();
      if (token) await this.handleLinkToken(String(message.chat.id), token);
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
    const senderChatId = String(message.from.id); // trong group, from.id == chatId của DM

    const conversationId = await this.redis.get(`telegram:topic:${groupId}:${threadId}`);
    if (!conversationId) return;

    try {
      const msg = await this.conversations.handleStaffReply(conversationId, senderChatId, text);
      if (msg) {
        this.chatGateway.emitToConversation(conversationId, 'message_received', msg);
      }
    } catch (err) {
      this.logger.error('Failed to handle group topic reply', err);
    }
  }

  // ─── DM reply (fallback) ───────────────────────────────────────────────────

  private async handleDmReply(message: any, text: string) {
    const chatId = String(message.chat.id);
    const conversationId = await this.redis.get(`telegram:active:${chatId}`);
    if (!conversationId) {
      await this.telegram.sendConfirmation(
        chatId,
        '⚠️ Không có cuộc hội thoại nào đang hoạt động. Vui lòng chờ khách hàng nhắn tin trước.',
      );
      return;
    }

    try {
      const msg = await this.conversations.handleStaffReply(conversationId, chatId, text);
      if (msg) {
        this.chatGateway.emitToConversation(conversationId, 'message_received', msg);
      }
    } catch (err) {
      this.logger.error('Failed to handle DM reply', err);
    }
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
