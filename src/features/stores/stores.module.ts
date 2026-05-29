import { Module } from '@nestjs/common';
import { AdminStoresController } from './admin-stores.controller';
import { AdminStoresService } from './admin-stores.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { TelegramModule } from '../../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [StoresController, AdminStoresController],
  providers: [StoresService, AdminStoresService],
  exports: [StoresService, AdminStoresService],
})
export class StoresModule {}
