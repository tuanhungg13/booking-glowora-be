import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';

const STORE_SETUP_TTL = 600; // 10 phút

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: TelegramBot | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram integration disabled');
      return;
    }
    this.bot = new TelegramBot(token);
    this.logger.log('TelegramBot instance created (polling disabled, webhook mode)');

    const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn('TELEGRAM_WEBHOOK_URL not set — webhook not registered');
      return;
    }
    // Cluster mode fork nhiều worker (xem main.ts), mỗi worker chạy 1 NestJS app riêng
    // nên đều tạo TelegramBot instance để gửi tin nhắn được (giữ nguyên) — nhưng đăng ký
    // webhook với Telegram API chỉ cần gọi 1 lần cho cả cụm, gọi ở mọi worker sẽ bị
    // Telegram rate-limit 429 (nhiều worker gọi setWebHook cùng lúc lúc khởi động).
    if (process.env.IS_SINGLETON_WORKER === '0') return;

    this.logger.log(`Setting Telegram webhook to: ${webhookUrl}`);
    this.bot.setWebHook(webhookUrl)
      .then(() => this.logger.log('✅ Telegram webhook set successfully'))
      .catch((err) => this.logger.error('❌ Failed to set Telegram webhook', err));
  }

  get isEnabled(): boolean {
    return this.bot !== null;
  }

  generateLinkToken(): string {
    return randomBytes(16).toString('hex');
  }

  async generateStoreSetupUrl(storeId: string): Promise<string | null> {
    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    if (!botUsername) {
      this.logger.warn('[generateStoreSetupUrl] TELEGRAM_BOT_USERNAME not set');
      return null;
    }
    const token = this.generateLinkToken();
    await this.redis.set(`telegram:store-setup:${token}`, storeId, STORE_SETUP_TTL);
    return `https://t.me/${botUsername}?startgroup=${token}`;
  }

  // ─── Group / Topic methods ─────────────────────────────────────────────────

  /**
   * Tạo topic mới trong supergroup (forum mode).
   * Trả về message_thread_id để lưu vào Conversation.telegramTopicId.
   */
  async createGroupTopic(groupId: string, topicName: string): Promise<number | null> {
    if (!this.bot) {
      this.logger.warn('[createGroupTopic] Bot is NULL (TELEGRAM_BOT_TOKEN missing) — skipping');
      return null;
    }
    this.logger.log(`[createGroupTopic] groupId=${groupId} topicName="${topicName}"`);
    try {
      const result = await (this.bot as any).createForumTopic(groupId, topicName);
      const threadId = result?.message_thread_id ?? null;
      this.logger.log(`[createGroupTopic] ✅ Created topic, message_thread_id=${threadId}`);
      return threadId;
    } catch (err: any) {
      this.logger.error(
        `[createGroupTopic] ❌ Failed — groupId=${groupId} topicName="${topicName}" ` +
        `| error: ${err?.message ?? err} ` +
        `| Causes: bot not admin, Topics not enabled on group, wrong groupId format`,
        err?.stack,
      );
      return null;
    }
  }

  async sendToGroupTopic(
    groupId: string,
    topicId: number,
    text: string,
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn('[sendToGroupTopic] Bot is NULL — skipping');
      return;
    }
    this.logger.log(`[sendToGroupTopic] groupId=${groupId} topicId=${topicId} text="${text.slice(0, 80)}..."`);
    try {
      await this.bot.sendMessage(groupId, text, {
        message_thread_id: topicId,
        parse_mode: 'Markdown',
      } as any);
      this.logger.log(`[sendToGroupTopic] ✅ Sent to group ${groupId} topic ${topicId}`);
    } catch (err: any) {
      this.logger.error(
        `[sendToGroupTopic] ❌ Failed — groupId=${groupId} topicId=${topicId} | error: ${err?.message ?? err}`,
        err?.stack,
      );
      throw err;
    }
  }

  async sendConfirmation(chatId: string, message: string): Promise<void> {
    if (!this.bot) return;
    this.logger.log(`[sendConfirmation] chatId=${chatId}`);
    await this.bot
      .sendMessage(chatId, message)
      .then(() => this.logger.log(`[sendConfirmation] ✅ Sent to chatId=${chatId}`))
      .catch((err: any) =>
        this.logger.error(`[sendConfirmation] ❌ Failed chatId=${chatId} | ${err?.message ?? err}`),
      );
  }

  async sendPhotoToGroupTopic(groupId: string, topicId: number, photoUrl: string, caption?: string): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.sendPhoto(groupId, photoUrl, { caption, message_thread_id: topicId } as any);
    } catch (err: any) {
      this.logger.error(`[sendPhotoToGroupTopic] Failed groupId=${groupId}`, err?.message);
      throw err;
    }
  }

  async sendVideoToGroupTopic(groupId: string, topicId: number, videoUrl: string, caption?: string): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.sendVideo(groupId, videoUrl, { caption, message_thread_id: topicId } as any);
    } catch (err: any) {
      this.logger.error(`[sendVideoToGroupTopic] Failed groupId=${groupId}`, err?.message);
      throw err;
    }
  }

  async getFileUrl(fileId: string): Promise<string | null> {
    if (!this.bot) return null;
    try {
      return await this.bot.getFileLink(fileId);
    } catch (err: any) {
      this.logger.error(`[getFileUrl] Failed for fileId=${fileId}`, err?.message);
      return null;
    }
  }

}
