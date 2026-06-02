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
