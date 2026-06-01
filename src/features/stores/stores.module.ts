import { Module } from '@nestjs/common';
import { AdminStoresController } from './admin-stores.controller';
import { AdminStoresService } from './admin-stores.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { StoreAnalyticsController } from './analytics/store-analytics.controller';
import { StoreAnalyticsService } from './analytics/store-analytics.service';
import { AdminAnalyticsController } from './admin-analytics/admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics/admin-analytics.service';
import { TelegramModule } from '../../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [StoresController, AdminStoresController, StoreAnalyticsController, AdminAnalyticsController],
  providers: [StoresService, AdminStoresService, StoreAnalyticsService, AdminAnalyticsService],
  exports: [StoresService, AdminStoresService],
})
export class StoresModule {}
