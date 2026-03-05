import { Module } from '@nestjs/common';
import { AppointmentsModule } from './booking/appointments/appointments.module';
import { PaymentsModule } from './booking/payments/payments.module';
import { ReviewsModule } from './booking/reviews/reviews.module';

/**
 * Feature: Booking
 * - Appointments (lịch hẹn)
 * - Payments (thanh toán)
 * - Reviews (đánh giá)
 */
@Module({
  imports: [
    AppointmentsModule,
    PaymentsModule,
    ReviewsModule,
  ],
  exports: [
    AppointmentsModule,
    PaymentsModule,
    ReviewsModule,
  ],
})
export class BookingModule {}
