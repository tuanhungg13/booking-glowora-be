import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from 'croner';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications/notifications.service';

@Injectable()
export class BookingReminderService implements OnModuleInit {
  private readonly logger = new Logger(BookingReminderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    const expr = this.config.get<string>('REMINDER_CRON_EXPR', '*/10 * * * *');
    new Cron(expr, () => { void this.handleReminders(); });
    this.logger.log(`Booking reminder job started (cron: ${expr})`);
  }

  async handleReminders() {
    await Promise.all([this.send1DayReminders(), this.send1HourReminders(), this.cancelExpiredDeposits(), this.sendDepositReminders()]);
  }

  private async send1DayReminders() {
    const fromH = Number(this.config.get<string>('REMINDER_1DAY_WINDOW_FROM_H', '23'));
    const toH = Number(this.config.get<string>('REMINDER_1DAY_WINDOW_TO_H', '25'));
    const now = Date.now();
    const from = new Date(now + fromH * 60 * 60 * 1000);
    const to = new Date(now + toH * 60 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.DEPOSIT_PAID, BookingStatus.PAID] },
        scheduledAt: { gte: from, lte: to },
        notifications: { none: { type: 'BOOKING_REMINDER_1DAY' } },
      },
      include: {
        customer: { select: { id: true, email: true, fullName: true } },
        store: { select: { name: true } },
        items: { include: { service: { select: { name: true } } } },
      },
    });

    for (const booking of bookings) {
      const serviceNames = booking.items.map((i) => i.service.name).join(', ');
      await this.notifications
        .notifyBookingReminder1Day({
          bookingId: booking.id,
          customerId: booking.customer.id,
          customerEmail: booking.customer.email,
          customerName: booking.customer.fullName,
          storeName: booking.store.name,
          serviceNames,
          scheduledAt: booking.scheduledAt,
        })
        .catch((err) => this.logger.error(`1-day reminder failed for booking ${booking.id}`, err));
    }

    if (bookings.length > 0) {
      this.logger.log(`Sent 1-day reminders: ${bookings.length} booking(s)`);
    }
  }

  private async send1HourReminders() {
    const fromM = Number(this.config.get<string>('REMINDER_1HOUR_WINDOW_FROM_M', '30'));
    const toM = Number(this.config.get<string>('REMINDER_1HOUR_WINDOW_TO_M', '90'));
    const now = Date.now();
    const from = new Date(now + fromM * 60 * 1000);
    const to = new Date(now + toM * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.DEPOSIT_PAID, BookingStatus.PAID] },
        scheduledAt: { gte: from, lte: to },
        notifications: { none: { type: 'BOOKING_REMINDER_1HOUR' } },
      },
      include: {
        customer: { select: { id: true, email: true, fullName: true } },
        store: { select: { name: true } },
        items: { include: { service: { select: { name: true } } } },
      },
    });

    for (const booking of bookings) {
      const serviceNames = booking.items.map((i) => i.service.name).join(', ');
      await this.notifications
        .notifyBookingReminder1Hour({
          bookingId: booking.id,
          customerId: booking.customer.id,
          customerEmail: booking.customer.email,
          customerName: booking.customer.fullName,
          storeName: booking.store.name,
          serviceNames,
          scheduledAt: booking.scheduledAt,
        })
        .catch((err) => this.logger.error(`1-hour reminder failed for booking ${booking.id}`, err));
    }

    if (bookings.length > 0) {
      this.logger.log(`Sent 1-hour reminders: ${bookings.length} booking(s)`);
    }
  }

  private async sendDepositReminders() {
    const now = Date.now();
    // Cửa sổ [now+25min, now+35min] — hẹp hơn để chỉ bắn đúng 1 lần trong 1 tick cron 10 phút
    const from = new Date(now + 25 * 60 * 1000);
    const to = new Date(now + 35 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.DEPOSIT_PENDING,
        depositDeadline: { gte: from, lte: to },
      },
      include: {
        customer: { select: { id: true } },
        store: { select: { name: true } },
        items: { include: { service: { select: { name: true } } } },
      },
    });

    for (const booking of bookings) {
      const serviceNames = booking.items.map((i) => i.service.name).join(', ');
      await this.notifications
        .notifyDepositReminder({
          bookingId: booking.id,
          customerId: booking.customer.id,
          storeName: booking.store.name,
          serviceNames,
          depositAmount: Number(booking.depositAmount),
          depositDeadline: booking.depositDeadline!,
        })
        .catch((err) => this.logger.error(`Deposit reminder failed for booking ${booking.id}`, err));
    }

    if (bookings.length > 0) {
      this.logger.log(`Sent deposit reminders (30min warning): ${bookings.length} booking(s)`);
    }
  }

  private async cancelExpiredDeposits() {
    const now = new Date();
    const bookings = await this.prisma.booking.findMany({
      where: { status: BookingStatus.DEPOSIT_PENDING, depositDeadline: { lt: now } },
      include: {
        customer: { select: { id: true, email: true, fullName: true } },
        store: { select: { id: true, name: true } },
        items: { include: { service: { select: { name: true } } } },
      },
    });

    for (const booking of bookings) {
      const result = await this.prisma.booking.updateMany({
        where: { id: booking.id, status: BookingStatus.DEPOSIT_PENDING },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: 'Hủy tự động do không thanh toán cọc đúng hạn',
        },
      });
      if (result.count === 0) continue;

      const serviceNames = booking.items.map((i) => i.service.name).join(', ');
      await this.notifications
        .notifyDepositExpired({
          bookingId: booking.id,
          storeId: booking.store.id,
          storeName: booking.store.name,
          customerId: booking.customer.id,
          customerName: booking.customer.fullName,
          customerEmail: booking.customer.email,
          serviceNames,
        })
        .catch((err) => this.logger.error(`Deposit expired notification failed for booking ${booking.id}`, err));
    }

    if (bookings.length > 0) {
      this.logger.log(`Auto-cancelled ${bookings.length} booking(s) due to deposit timeout`);
    }
  }
}
