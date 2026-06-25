-- DropForeignKey
ALTER TABLE `bookings` DROP FOREIGN KEY `bookings_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `payments` DROP FOREIGN KEY `payments_customer_id_fkey`;

-- AlterTable
ALTER TABLE `bookings` MODIFY `customer_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `payments` MODIFY `customer_id` CHAR(36) NULL;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
