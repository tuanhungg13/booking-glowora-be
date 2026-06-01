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
}
