import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { StoreBookingsController } from './store-bookings.controller';
import { BookingReminderService } from './booking-reminder.service';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [NotificationsModule, CouponsModule],
  controllers: [BookingsController, StoreBookingsController],
  providers: [BookingsService, BookingReminderService],
  exports: [BookingsService],
})
export class BookingsModule {}
