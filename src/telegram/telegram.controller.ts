import { Body, Controller, Inject, Logger, Post, forwardRef } from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConversationsService, MessageAttachmentInput } from '../features/messaging/conversations/conversations.service';
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
    if (!message?.text && !message?.photo && !message?.video) return { ok: true };

    const text: string = message.text ?? message.caption ?? '';
    const threadId: number | undefined = message.message_thread_id;

    // /start <token> — link staff (DM) hoặc setup group store (supergroup)
    // Telegram group gửi dạng "/start@botname token", DM gửi "/start token"
    const startMatch = text.match(/^\/start(?:@\S+)?(?:\s+(\S+))?$/);
    if (startMatch) {
      const token = startMatch[1];
      if (!token) {
        this.logger.warn(`[webhook] /start received but no token — text="${text}"`);
        return { ok: true };
      }
      if (message.chat.type !== 'private') {
        await this.handleGroupSetupToken(String(message.chat.id), token);
      }
      return { ok: true };
    }

    if (threadId) {
      await this.handleGroupTopicReply(message, threadId, text);
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

    const attachments: MessageAttachmentInput[] = [];
    if (message.photo) {
      const photo = message.photo[message.photo.length - 1];
      const url = await this.telegram.getFileUrl(photo.file_id);
      if (url) {
        attachments.push({
          type: 'image',
          url,
          publicId: photo.file_id,
          fileName: `photo_${photo.file_id}.jpg`,
          fileSize: photo.file_size ?? 0,
          mimeType: 'image/jpeg',
          width: photo.width,
          height: photo.height,
        });
      }
    } else if (message.video) {
      const video = message.video;
      const url = await this.telegram.getFileUrl(video.file_id);
      if (url) {
        attachments.push({
          type: 'video',
          url,
          publicId: video.file_id,
          fileName: video.file_name ?? `video_${video.file_id}.mp4`,
          fileSize: video.file_size ?? 0,
          mimeType: video.mime_type ?? 'video/mp4',
          width: video.width,
          height: video.height,
          duration: video.duration,
        });
      }
    }

    try {
      const msg = await this.conversations.handleStaffReply(conversationId, senderChatId, text, attachments);
      if (msg) {
        this.chatGateway.emitToConversation(conversationId, 'message_received', msg);
        const storeId = (msg as any).conversation?.store?.id as string | undefined;
        const storeName = (msg as any).conversation?.store?.name as string | undefined;
        const customerId = (msg as any).conversation?.customerId as string | undefined;
        const preview = (msg.content ?? '').slice(0, 100) || (attachments.length > 0 ? (attachments[0].type === 'video' ? '[Video]' : '[Ảnh]') : '');
        if (storeId) {
          this.chatGateway.emitToStore(storeId, 'new_message_notification', { conversationId, storeName: storeName ?? '', preview });
        }
        if (customerId) {
          this.chatGateway.emitToUser(customerId, 'new_message_notification', { conversationId, storeName: storeName ?? 'Nhân viên', preview });
        }
        this.logger.log(`[handleGroupTopicReply] ✅ Message emitted to WebSocket room conv:${conversationId}`);
      } else {
        this.logger.warn(`[handleGroupTopicReply] handleStaffReply returned null — message not emitted`);
      }
    } catch (err) {
      this.logger.error('Failed to handle group topic reply', err);
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

    this.chatGateway.emitToStore(storeId, 'telegram_linked', { telegramGroupId: groupId });

    await this.telegram.sendConfirmation(
      groupId,
      '✅ Nhóm đã kết nối với Glowora!\n\n' +
      '⚠️ Bước cuối: cấp quyền Admin cho bot để nhận tin nhắn từ khách hàng:\n' +
      'Thông tin nhóm → Quản trị viên → Thêm bot → tick ✅ Quản lý chủ đề',
    );
  }

}
