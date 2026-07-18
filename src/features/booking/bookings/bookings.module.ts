import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { StoreBookingsController } from './store-bookings.controller';
import { BookingReminderService } from './booking-reminder.service';
import { BookingReminderConsumer } from './booking-reminder.consumer';
import { CouponsModule } from '../coupons/coupons.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [NotificationsModule, CouponsModule, PaymentsModule, PromotionsModule],
  controllers: [BookingsController, StoreBookingsController, BookingReminderConsumer],
  providers: [BookingsService, BookingReminderService],
  exports: [BookingsService],
})
export class BookingsModule {}
