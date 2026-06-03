import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { StoreCouponsController } from './store-coupons.controller';
import { AdminCouponsController } from './admin-coupons.controller';

@Module({
  controllers: [CouponsController, StoreCouponsController, AdminCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
