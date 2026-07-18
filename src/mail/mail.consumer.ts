import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { MailService } from './mail.service';
import { RabbitmqTopologyService } from '../rabbitmq/rabbitmq-topology.service';
import { RABBITMQ_MAX_RETRY_ATTEMPTS, RABBITMQ_QUEUES } from '../rabbitmq/rabbitmq.constants';

@Controller()
export class MailConsumer {
  private readonly logger = new Logger(MailConsumer.name);

  constructor(
    private readonly mail: MailService,
    private readonly rabbitmqTopology: RabbitmqTopologyService,
  ) {}

  @EventPattern('mail.otp-verification')
  async handleOtpVerification(
    @Payload() data: { email: string; otp: string; fullName?: string },
    @Ctx() ctx: RmqContext,
  ) {
    await this.ack(ctx, () => this.mail.sendOtpVerification(data.email, data.otp, data.fullName));
  }

  @EventPattern('mail.password-reset-otp')
  async handlePasswordResetOtp(
    @Payload() data: { email: string; otp: string; fullName?: string },
    @Ctx() ctx: RmqContext,
  ) {
    await this.ack(ctx, () => this.mail.sendPasswordResetOtp(data.email, data.otp, data.fullName));
  }

  @EventPattern('mail.booking-event')
  async handleBookingEvent(@Payload() data: Parameters<MailService['sendBookingEvent']>[0], @Ctx() ctx: RmqContext) {
    await this.ack(ctx, () => this.mail.sendBookingEvent(data));
  }

  @EventPattern('mail.staff-notification')
  async handleStaffNotification(@Payload() data: Parameters<MailService['sendStaffNotification']>[0], @Ctx() ctx: RmqContext) {
    await this.ack(ctx, () => this.mail.sendStaffNotification(data));
  }

  @EventPattern('mail.staff-invite')
  async handleStaffInvite(@Payload() data: Parameters<MailService['sendStaffInvite']>[0], @Ctx() ctx: RmqContext) {
    await this.ack(ctx, () => this.mail.sendStaffInvite(data));
  }

  @EventPattern('mail.booking-reminder')
  async handleBookingReminder(@Payload() data: Parameters<MailService['sendBookingReminder']>[0], @Ctx() ctx: RmqContext) {
    await this.ack(ctx, () => this.mail.sendBookingReminder(data));
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
        await this.rabbitmqTopology.publishRetry(RABBITMQ_QUEUES.NOTIFICATIONS_EMAIL, originalMsg.content, attempt);
        channel.ack(originalMsg);
      } else {
        this.logger.error(`Handler failed after ${RABBITMQ_MAX_RETRY_ATTEMPTS} attempts, routing to DLQ: ${err?.message}`, err?.stack);
        channel.nack(originalMsg, false, false);
      }
    }
  }
}
