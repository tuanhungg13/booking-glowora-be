import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailer: MailerService) {}

  async sendOtpVerification(email: string, otp: string, fullName?: string): Promise<void> {
    await this.mailer.sendMail({
      to: email,
      subject: '[Glowora] Mã xác nhận đăng ký tài khoản',
      template: 'otp',
      context: { otp, fullName: fullName || email, expiresIn: 10 },
    });
    this.logger.log(`OTP verification email sent to ${email}`);
  }

  async sendPasswordResetOtp(email: string, otp: string, fullName?: string): Promise<void> {
    await this.mailer.sendMail({
      to: email,
      subject: '[Glowora] Mã xác nhận đặt lại mật khẩu',
      template: 'reset-password',
      context: { otp, fullName: fullName || email, expiresIn: 10 },
    });
    this.logger.log(`Password reset OTP email sent to ${email}`);
  }

  async sendBookingEvent(params: {
    email: string;
    fullName: string;
    storeName: string;
    serviceNames: string;
    scheduledAt?: string;
    reason?: string;
    amount?: string;
    depositDeadline?: string;
    eventType: 'CREATED' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'PAYMENT_SUCCESS' | 'DEPOSIT_REQUIRED' | 'DEPOSIT_PAID';
  }): Promise<void> {
    const { email, fullName, storeName, serviceNames, scheduledAt, reason, amount, depositDeadline, eventType } = params;
    const subjects: Record<string, string> = {
      CREATED: `[Glowora] Xác nhận đặt lịch tại ${storeName}`,
      CONFIRMED: `[Glowora] Lịch hẹn tại ${storeName} đã được xác nhận`,
      REJECTED: `[Glowora] Lịch hẹn tại ${storeName} chưa được xác nhận`,
      CANCELLED: `[Glowora] Lịch hẹn tại ${storeName} đã bị hủy`,
      COMPLETED: `[Glowora] Cảm ơn bạn đã sử dụng dịch vụ tại ${storeName}`,
      PAYMENT_SUCCESS: `[Glowora] Xác nhận thanh toán thành công tại ${storeName}`,
      DEPOSIT_REQUIRED: `[Glowora] Vui lòng thanh toán tiền cọc cho lịch hẹn tại ${storeName}`,
      DEPOSIT_PAID: `[Glowora] Đặt cọc thành công tại ${storeName}`,
    };
    await this.mailer.sendMail({
      to: email,
      subject: subjects[eventType],
      template: 'booking-event',
      context: {
        fullName,
        storeName,
        serviceNames,
        scheduledAt,
        reason,
        amount,
        depositDeadline,
        isCreated: eventType === 'CREATED',
        isConfirmed: eventType === 'CONFIRMED',
        isRejected: eventType === 'REJECTED',
        isCancelled: eventType === 'CANCELLED',
        isCompleted: eventType === 'COMPLETED',
        isPaymentSuccess: eventType === 'PAYMENT_SUCCESS',
        isDepositRequired: eventType === 'DEPOSIT_REQUIRED',
        isDepositPaid: eventType === 'DEPOSIT_PAID',
      },
    });
    this.logger.log(`Booking event email (${eventType}) sent to ${email}`);
  }

  async sendStaffNotification(params: {
    email: string;
    fullName: string;
    subject: string;
    body: string;
    details?: Array<{ label: string; value: string }>;
    actionUrl?: string;
    actionLabel?: string;
  }): Promise<void> {
    const { email, fullName, subject, body, details, actionUrl, actionLabel } = params;
    await this.mailer.sendMail({
      to: email,
      subject: `[Glowora] ${subject}`,
      template: 'staff-notification',
      context: {
        fullName,
        subject,
        body,
        hasDetails: !!details?.length,
        details: details ?? [],
        hasAction: !!actionUrl,
        actionUrl,
        actionLabel,
      },
    });
    this.logger.log(`Staff notification email (${subject}) sent to ${email}`);
  }

  async sendStaffInvite(params: {
    email: string;
    fullName: string;
    storeName: string;
    inviteUrl: string;
  }): Promise<void> {
    const { email, fullName, storeName, inviteUrl } = params;
    await this.mailer.sendMail({
      to: email,
      subject: `[Glowora] Lời mời làm nhân viên tại ${storeName}`,
      template: 'staff-invite',
      context: { fullName, storeName, inviteUrl },
    });
    this.logger.log(`Staff invite email sent to ${email}`);
  }

  async sendBookingReminder(params: {
    email: string;
    fullName: string;
    storeName: string;
    serviceNames: string;
    scheduledAt: string;
    isOneDayReminder: boolean;
  }): Promise<void> {
    const { email, fullName, storeName, serviceNames, scheduledAt, isOneDayReminder } = params;
    const subject = isOneDayReminder
      ? `[Glowora] Nhắc nhở: Lịch hẹn tại ${storeName} vào ngày mai`
      : `[Glowora] Nhắc nhở: Lịch hẹn tại ${storeName} sau 1 giờ nữa`;

    await this.mailer.sendMail({
      to: email,
      subject,
      template: 'booking-reminder',
      context: { fullName, storeName, serviceNames, scheduledAt, isOneDayReminder },
    });
    this.logger.log(`Booking reminder email sent to ${email} (${isOneDayReminder ? '1-day' : '1-hour'})`);
  }
}
