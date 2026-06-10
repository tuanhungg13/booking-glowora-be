import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { StorePromotionsController } from './store-promotions.controller';

@Module({
  controllers: [StorePromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
