import { Module } from '@nestjs/common';
import { AdminStoresController } from './admin-stores.controller';
import { AdminStoresService } from './admin-stores.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  controllers: [StoresController, AdminStoresController],
  providers: [StoresService, AdminStoresService],
  exports: [StoresService, AdminStoresService],
})
export class StoresModule {}
