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

    const chatId = String(message.chat.id);
    const text: string = message.text;

    if (text.startsWith('/start ')) {
      const token = text.split(' ')[1]?.trim();
      if (token) await this.handleLinkToken(chatId, token);
      return { ok: true };
    }

    const conversationId = await this.redis.get(`telegram:active:${chatId}`);
    if (!conversationId) {
      await this.telegram.sendConfirmation(
        chatId,
        '⚠️ Không có cuộc hội thoại nào đang hoạt động. Vui lòng chờ khách hàng nhắn tin trước.',
      );
      return { ok: true };
    }

    try {
      const msg = await this.conversations.handleStaffReply(conversationId, chatId, text);
      if (msg) {
        this.chatGateway.emitToConversation(conversationId, 'message_received', msg);
      }
    } catch (err) {
      this.logger.error('Failed to handle staff reply', err);
    }

    return { ok: true };
  }

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
