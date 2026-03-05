import { Module } from '@nestjs/common';
import { CategoriesModule } from './catalog/categories/categories.module';
import { ServicesModule } from './catalog/services/services.module';
import { CombosModule } from './catalog/combos/combos.module';
import { MaterialsModule } from './catalog/materials/materials.module';

/**
 * Feature: Catalog
 * - Categories
 * - Services (dịch vụ)
 * - Combos
 * - Materials (nguyên vật liệu)
 */
@Module({
  imports: [
    CategoriesModule,
    ServicesModule,
    CombosModule,
    MaterialsModule,
  ],
  exports: [
    CategoriesModule,
    ServicesModule,
    CombosModule,
    MaterialsModule,
  ],
})
export class CatalogModule {}
