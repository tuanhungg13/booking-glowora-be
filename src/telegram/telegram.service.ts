import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';

const STORE_SETUP_TTL = 600; // 10 phút
const WEBHOOK_SECRET_KEY = 'telegram:webhook-secret';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: TelegramBot | null = null;
  // Secret Telegram gửi kèm header X-Telegram-Bot-Api-Secret-Token trên mọi webhook call —
  // dùng để xác minh request thực sự đến từ Telegram, không phải bên thứ 3 giả mạo.
  // Lưu ở Redis (không phải biến môi trường) để mọi worker trong cluster đọc được cùng
  // 1 giá trị mà không cần cấu hình thêm.
  private webhookSecret: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
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

    // Mọi worker đều phải có secret để verify request tới /telegram/webhook (không chỉ
    // worker gọi setWebHook), nên load/generate secret trước, bất kể có phải singleton hay không.
    this.webhookSecret = await this.redis.get(WEBHOOK_SECRET_KEY);
    if (!this.webhookSecret) {
      this.webhookSecret = randomBytes(32).toString('hex');
      await this.redis.set(WEBHOOK_SECRET_KEY, this.webhookSecret);
    }

    // Cluster mode fork nhiều worker (xem main.ts), mỗi worker chạy 1 NestJS app riêng
    // nên đều tạo TelegramBot instance để gửi tin nhắn được (giữ nguyên) — nhưng đăng ký
    // webhook với Telegram API chỉ cần gọi 1 lần cho cả cụm, gọi ở mọi worker sẽ bị
    // Telegram rate-limit 429 (nhiều worker gọi setWebHook cùng lúc lúc khởi động).
    if (process.env.IS_SINGLETON_WORKER === '0') return;

    this.logger.log(`Setting Telegram webhook to: ${webhookUrl}`);
    this.bot.setWebHook(webhookUrl, { secret_token: this.webhookSecret })
      .then(() => this.logger.log('✅ Telegram webhook set successfully'))
      .catch((err) => this.logger.error('❌ Failed to set Telegram webhook', err));
  }

  // Dùng hash trước khi so sánh để timingSafeEqual không đòi hỏi 2 chuỗi cùng độ dài
  // (giống cách verifySepayWebhook làm ở payments/sepay.util.ts).
  verifyWebhookSecret(token: string | undefined): boolean {
    if (!this.webhookSecret || !token) return false;
    const a = createHash('sha256').update(token).digest();
    const b = createHash('sha256').update(this.webhookSecret).digest();
    return timingSafeEqual(a, b);
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
