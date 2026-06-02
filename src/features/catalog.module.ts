import { Module } from '@nestjs/common';
import { CategoriesModule } from './catalog/categories/categories.module';
import { ServicesModule } from './catalog/services/services.module';

@Module({
  imports: [CategoriesModule, ServicesModule],
  exports: [CategoriesModule, ServicesModule],
})
export class CatalogModule {}
