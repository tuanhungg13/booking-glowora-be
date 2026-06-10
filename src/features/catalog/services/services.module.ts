import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesImportService } from './services-import.service';
import { ServicesController } from './services.controller';
import { PromotionsModule } from '../../booking/promotions/promotions.module';

@Module({
  imports: [PromotionsModule],
  controllers: [ServicesController],
  providers: [ServicesService, ServicesImportService],
  exports: [ServicesService],
})
export class ServicesModule {}
