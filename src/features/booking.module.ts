import { Module } from '@nestjs/common';
import { BookingsModule } from './booking/bookings/bookings.module';
import { PaymentsModule } from './booking/payments/payments.module';
import { ReviewsModule } from './booking/reviews/reviews.module';
import { SlotsModule } from './booking/slots/slots.module';

@Module({
  imports: [BookingsModule, PaymentsModule, ReviewsModule, SlotsModule],
  exports: [BookingsModule, PaymentsModule, ReviewsModule, SlotsModule],
})
export class BookingModule {}
