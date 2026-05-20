import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';
import { randomBytes } from 'crypto';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: TelegramBot | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram integration disabled');
      return;
    }
    this.bot = new TelegramBot(token);

    const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
    if (webhookUrl) {
      this.bot.setWebHook(webhookUrl).catch((err) =>
        this.logger.error('Failed to set Telegram webhook', err),
      );
    }
  }

  get isEnabled(): boolean {
    return this.bot !== null;
  }

  generateLinkToken(): string {
    return randomBytes(16).toString('hex');
  }

  async sendEscalationAlert(
    chatId: string,
    customerName: string,
    lastMessages: Array<{ content: string; senderType: string }>,
    conversationId: string,
  ): Promise<void> {
    if (!this.bot) return;

    const preview = lastMessages
      .slice(-3)
      .map((m) => `  ${m.senderType === 'BOT' ? '🤖' : '👤'} ${m.content}`)
      .join('\n');

    const text =
      `🔔 *Khách hàng cần tư vấn trực tiếp*\n\n` +
      `👤 Khách: *${customerName}*\n\n` +
      `📋 Lịch sử gần đây:\n${preview || '  (Chưa có tin nhắn)'}\n\n` +
      `💬 Nhắn tin vào đây để trả lời khách hàng.\n` +
      `🆔 ConvID: \`${conversationId}\``;

    await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch((err) =>
      this.logger.error(`Failed to send escalation alert to ${chatId}`, err),
    );
  }

  async sendNewMessage(
    chatId: string,
    customerName: string,
    content: string,
  ): Promise<void> {
    if (!this.bot) return;

    const text = `💬 *${customerName}*:\n${content}`;
    await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch((err) =>
      this.logger.error(`Failed to forward message to ${chatId}`, err),
    );
  }

  async sendConfirmation(chatId: string, message: string): Promise<void> {
    if (!this.bot) return;
    await this.bot.sendMessage(chatId, message).catch(() => undefined);
  }
}
