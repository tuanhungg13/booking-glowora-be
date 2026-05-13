import { Module } from '@nestjs/common';
import { CategoriesModule } from './catalog/categories/categories.module';
import { ServicesModule } from './catalog/services/services.module';
import { CombosModule } from './catalog/combos/combos.module';

/**
 * Feature: Catalog
 * - Categories
 * - Services (dịch vụ)
 * - Combos
 */
@Module({
  imports: [
    CategoriesModule,
    ServicesModule,
    CombosModule,
  ],
  exports: [
    CategoriesModule,
    ServicesModule,
    CombosModule,
  ],
})
export class CatalogModule {}
