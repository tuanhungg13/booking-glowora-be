import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { StoreBookingsController } from './store-bookings.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController, StoreBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
