import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { WebPushService } from './web-push.service';
import { RabbitmqTopologyService } from '../../../rabbitmq/rabbitmq-topology.service';
import { RABBITMQ_MAX_RETRY_ATTEMPTS, RABBITMQ_QUEUES } from '../../../rabbitmq/rabbitmq.constants';

@Controller()
export class WebPushConsumer {
  private readonly logger = new Logger(WebPushConsumer.name);

  constructor(
    private readonly webPush: WebPushService,
    private readonly rabbitmqTopology: RabbitmqTopologyService,
  ) {}

  @EventPattern('push.send-to-user')
  async handleSendToUser(
    @Payload() data: { userId: string; title: string; body: string; data?: Record<string, unknown> },
    @Ctx() ctx: RmqContext,
  ) {
    await this.ack(ctx, async () => {
      await this.webPush.sendToUser(data.userId, { title: data.title, body: data.body, data: data.data });
    });
  }

  @EventPattern('push.send-to-users')
  async handleSendToUsers(
    @Payload() items: Array<{ userId: string; title: string; body: string; data?: Record<string, unknown> }>,
    @Ctx() ctx: RmqContext,
  ) {
    await this.ack(ctx, async () => {
      await this.webPush.sendToUsers(items);
    });
  }

  private async ack(ctx: RmqContext, fn: () => Promise<void>) {
    const channel = ctx.getChannelRef() as Channel;
    const originalMsg = ctx.getMessage() as Message;
    try {
      await fn();
      channel.ack(originalMsg);
    } catch (err: any) {
      const attempt = (originalMsg.properties.headers?.['x-retry-count'] ?? 0) + 1;
      if (attempt <= RABBITMQ_MAX_RETRY_ATTEMPTS) {
        this.logger.warn(`Handler failed (attempt ${attempt}/${RABBITMQ_MAX_RETRY_ATTEMPTS}), retrying: ${err?.message}`);
        await this.rabbitmqTopology.publishRetry(RABBITMQ_QUEUES.NOTIFICATIONS_PUSH, originalMsg.content, attempt);
        channel.ack(originalMsg);
      } else {
        this.logger.error(`Handler failed after ${RABBITMQ_MAX_RETRY_ATTEMPTS} attempts, routing to DLQ: ${err?.message}`, err?.stack);
        channel.nack(originalMsg, false, false);
      }
    }
  }
}
