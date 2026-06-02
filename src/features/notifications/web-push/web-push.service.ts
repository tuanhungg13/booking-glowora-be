import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webPush from 'web-push';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private enabled = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys not configured — Web Push disabled');
      return;
    }

    const rawFrom = process.env.MAIL_FROM ?? 'no-reply@glowora.com';
    const email = rawFrom.match(/<(.+?)>/)?.[1] ?? rawFrom;
    webPush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
    this.enabled = true;
    this.logger.log('Web Push initialized');
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY ?? '';
  }

  async saveSubscription(userId: string, dto: SubscribeDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.p256dh, auth: dto.auth },
      update: { userId },
    });
  }

  async deleteSubscription(endpoint: string, userId: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
    return { deleted: true };
  }

  async sendToUser(userId: string, payload: { title: string; body: string; data?: Record<string, unknown> }) {
    if (!this.enabled) return;

    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;

    const payloadStr = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr,
        ),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const err = result.reason as { statusCode?: number };
        // 410 Gone / 404 Not Found = subscription expired, remove it
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await this.prisma.pushSubscription.delete({ where: { id: subs[i].id } }).catch(() => undefined);
        } else {
          this.logger.warn(`Push failed for sub ${subs[i].id}: HTTP ${err?.statusCode}`);
        }
      }
    }
  }
}
