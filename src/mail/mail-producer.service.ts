import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { RABBITMQ_CLIENT } from '../rabbitmq/rabbitmq.constants';

@Injectable()
export class MailProducerService {
  private readonly logger = new Logger(MailProducerService.name);

  constructor(
    @Inject(RABBITMQ_CLIENT.NOTIFICATIONS_EMAIL) private readonly client: ClientProxy,
  ) {}

  sendOtpVerification(email: string, otp: string, fullName?: string): void {
    this.publish('mail.otp-verification', { email, otp, fullName });
  }

  sendPasswordResetOtp(email: string, otp: string, fullName?: string): void {
    this.publish('mail.password-reset-otp', { email, otp, fullName });
  }

  sendBookingEvent(params: {
    email: string;
    fullName: string;
    storeName: string;
    serviceNames: string;
    scheduledAt?: string;
    reason?: string;
    amount?: string;
    depositDeadline?: string;
    eventType: 'CREATED' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'PAYMENT_SUCCESS' | 'DEPOSIT_REQUIRED' | 'DEPOSIT_PAID';
  }): void {
    this.publish('mail.booking-event', params);
  }

  sendStaffNotification(params: {
    email: string;
    fullName: string;
    subject: string;
    body: string;
    details?: Array<{ label: string; value: string }>;
    actionUrl?: string;
    actionLabel?: string;
  }): void {
    this.publish('mail.staff-notification', params);
  }

  sendStaffInvite(params: {
    email: string;
    fullName: string;
    storeName: string;
    inviteUrl: string;
  }): void {
    this.publish('mail.staff-invite', params);
  }

  sendBookingReminder(params: {
    email: string;
    fullName: string;
    storeName: string;
    serviceNames: string;
    scheduledAt: string;
    isOneDayReminder: boolean;
  }): void {
    this.publish('mail.booking-reminder', params);
  }

  private publish(pattern: string, payload: unknown): void {
    this.client.emit(pattern, payload).subscribe({
      error: (err: Error) => this.logger.error(`Publish "${pattern}" failed: ${err.message}`, err.stack),
    });
  }
}
