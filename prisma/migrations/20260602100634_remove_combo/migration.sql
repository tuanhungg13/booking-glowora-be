/*
  Warnings:

  - You are about to drop the `combo_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `combos` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `combo_items` DROP FOREIGN KEY `combo_items_combo_id_fkey`;

-- DropForeignKey
ALTER TABLE `combo_items` DROP FOREIGN KEY `combo_items_service_id_fkey`;

-- DropForeignKey
ALTER TABLE `combos` DROP FOREIGN KEY `combos_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `combos` DROP FOREIGN KEY `combos_shop_id_fkey`;

-- DropTable
DROP TABLE `combo_items`;

-- DropTable
DROP TABLE `combos`;
