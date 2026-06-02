import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from 'croner';
import { BookingStatus, NotificationType } from '@prisma/client';
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
    await Promise.all([this.send1DayReminders(), this.send1HourReminders()]);
  }

  private async send1DayReminders() {
    const fromH = Number(this.config.get<string>('REMINDER_1DAY_WINDOW_FROM_H', '23'));
    const toH = Number(this.config.get<string>('REMINDER_1DAY_WINDOW_TO_H', '25'));
    const now = Date.now();
    const from = new Date(now + fromH * 60 * 60 * 1000);
    const to = new Date(now + toH * 60 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        scheduledAt: { gte: from, lte: to },
        notifications: { none: { type: NotificationType.BOOKING_REMINDER_1DAY } },
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
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        scheduledAt: { gte: from, lte: to },
        notifications: { none: { type: NotificationType.BOOKING_REMINDER_1HOUR } },
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
}
