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

  async deleteAllSubscriptionsForUser(userId: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId } });
  }

  async sendToUser(userId: string, payload: { title: string; body: string; data?: Record<string, unknown> }) {
    return this.sendToUsers([{ userId, ...payload }]);
  }

  // Gộp 1 lần query pushSubscription cho nhiều user thay vì gọi sendToUser() tuần tự từng
  // người (mỗi lần lại tự query riêng) — dùng khi 1 sự kiện (vd tạo booking) cần push đồng
  // thời cho owner + customer, để giảm round-trip DB dưới tải cao.
  async sendToUsers(
    items: Array<{ userId: string; title: string; body: string; data?: Record<string, unknown> }>,
  ) {
    if (!this.enabled || items.length === 0) return;

    const userIds = items.map((i) => i.userId);
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    if (!subs.length) return;

    const payloadByUser = new Map(
      items.map((i) => [i.userId, JSON.stringify({ title: i.title, body: i.body, data: i.data })]),
    );

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadByUser.get(sub.userId)!,
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
