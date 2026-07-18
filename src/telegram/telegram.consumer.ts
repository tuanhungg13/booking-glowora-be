import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { TelegramService } from './telegram.service';
import { RabbitmqTopologyService } from '../rabbitmq/rabbitmq-topology.service';
import { RABBITMQ_MAX_RETRY_ATTEMPTS, RABBITMQ_QUEUES } from '../rabbitmq/rabbitmq.constants';

@Controller()
export class TelegramConsumer {
  private readonly logger = new Logger(TelegramConsumer.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly rabbitmqTopology: RabbitmqTopologyService,
  ) {}

  @EventPattern('telegram.send-to-group-topic')
  async handleSendToGroupTopic(
    @Payload() data: { groupId: string; topicId: number; text: string },
    @Ctx() ctx: RmqContext,
  ) {
    await this.ack(ctx, () => this.telegram.sendToGroupTopic(data.groupId, data.topicId, data.text));
  }

  @EventPattern('telegram.send-photo-to-group-topic')
  async handleSendPhotoToGroupTopic(
    @Payload() data: { groupId: string; topicId: number; photoUrl: string; caption?: string },
    @Ctx() ctx: RmqContext,
  ) {
    await this.ack(ctx, () =>
      this.telegram.sendPhotoToGroupTopic(data.groupId, data.topicId, data.photoUrl, data.caption),
    );
  }

  @EventPattern('telegram.send-video-to-group-topic')
  async handleSendVideoToGroupTopic(
    @Payload() data: { groupId: string; topicId: number; videoUrl: string; caption?: string },
    @Ctx() ctx: RmqContext,
  ) {
    await this.ack(ctx, () =>
      this.telegram.sendVideoToGroupTopic(data.groupId, data.topicId, data.videoUrl, data.caption),
    );
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
        await this.rabbitmqTopology.publishRetry(RABBITMQ_QUEUES.TELEGRAM_FORWARD, originalMsg.content, attempt);
        channel.ack(originalMsg);
      } else {
        this.logger.error(`Handler failed after ${RABBITMQ_MAX_RETRY_ATTEMPTS} attempts, routing to DLQ: ${err?.message}`, err?.stack);
        channel.nack(originalMsg, false, false);
      }
    }
  }
}
