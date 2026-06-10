import { Module } from '@nestjs/common';
import { BookingsModule } from './booking/bookings/bookings.module';
import { PaymentsModule } from './booking/payments/payments.module';
import { ReviewsModule } from './booking/reviews/reviews.module';
import { SlotsModule } from './booking/slots/slots.module';
import { CouponsModule } from './booking/coupons/coupons.module';
import { PromotionsModule } from './booking/promotions/promotions.module';

@Module({
  imports: [BookingsModule, PaymentsModule, ReviewsModule, SlotsModule, CouponsModule, PromotionsModule],
  exports: [BookingsModule, PaymentsModule, ReviewsModule, SlotsModule, CouponsModule, PromotionsModule],
})
export class BookingModule {}
