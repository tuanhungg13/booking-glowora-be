-- DropForeignKey
ALTER TABLE `booking_items` DROP FOREIGN KEY `booking_items_service_id_fkey`;

-- DropForeignKey
ALTER TABLE `booking_items` DROP FOREIGN KEY `booking_items_variant_id_fkey`;

-- DropForeignKey
ALTER TABLE `reviews` DROP FOREIGN KEY `reviews_service_id_fkey`;

-- DropIndex
DROP INDEX `booking_items_service_id_fkey` ON `booking_items`;

-- DropIndex
DROP INDEX `booking_items_variant_id_fkey` ON `booking_items`;

-- AlterTable
ALTER TABLE `booking_items` MODIFY `service_id` CHAR(36) NULL,
    MODIFY `variant_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `reviews` ADD COLUMN `service_name` VARCHAR(150) NULL,
    MODIFY `service_id` CHAR(36) NULL;

-- Backfill service_name snapshot for existing reviews from their still-linked service
UPDATE `reviews` r
INNER JOIN `services` s ON s.id = r.service_id
SET r.service_name = s.name
WHERE r.service_name IS NULL;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `service_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
