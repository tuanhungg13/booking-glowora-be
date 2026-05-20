import { Module } from '@nestjs/common';
import { AppointmentsModule } from './booking/appointments/appointments.module';
import { PaymentsModule } from './booking/payments/payments.module';
import { ReviewsModule } from './booking/reviews/reviews.module';
import { SlotsModule } from './booking/slots/slots.module';

@Module({
  imports: [AppointmentsModule, PaymentsModule, ReviewsModule, SlotsModule],
  exports: [AppointmentsModule, PaymentsModule, ReviewsModule, SlotsModule],
})
export class BookingModule {}
