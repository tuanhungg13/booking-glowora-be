/*
  Warnings:

  - You are about to drop the column `appointment_id` on the `notifications` table. All the data in the column will be lost.
  - The values [APPOINTMENT_CREATED,APPOINTMENT_CONFIRMED,APPOINTMENT_REJECTED,APPOINTMENT_COMPLETED,APPOINTMENT_CANCELLED] on the enum `notifications_type` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `appointment_id` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `appointment_id` on the `reviews` table. All the data in the column will be lost.
  - The values [APPOINTMENT_CREATED,APPOINTMENT_CONFIRMED,APPOINTMENT_REJECTED,APPOINTMENT_COMPLETED,APPOINTMENT_CANCELLED] on the enum `system_logs_type` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `appointments` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[booking_item_id]` on the table `reviews` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `booking_id` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `booking_id` to the `reviews` table without a default value. This is not possible if the table is not empty.
  - Added the required column `booking_item_id` to the `reviews` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `appointments` DROP FOREIGN KEY `appointments_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `appointments` DROP FOREIGN KEY `appointments_service_id_fkey`;

-- DropForeignKey
ALTER TABLE `appointments` DROP FOREIGN KEY `appointments_staff_id_fkey`;

-- DropForeignKey
ALTER TABLE `appointments` DROP FOREIGN KEY `appointments_store_id_fkey`;

-- DropForeignKey
ALTER TABLE `appointments` DROP FOREIGN KEY `appointments_variant_id_fkey`;

-- DropForeignKey
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_appointment_id_fkey`;

-- DropForeignKey
ALTER TABLE `payments` DROP FOREIGN KEY `payments_appointment_id_fkey`;

-- DropForeignKey
ALTER TABLE `reviews` DROP FOREIGN KEY `reviews_appointment_id_fkey`;

-- DropIndex
DROP INDEX `notifications_appointment_id_fkey` ON `notifications`;

-- DropIndex
DROP INDEX `payments_appointment_id_idx` ON `payments`;

-- DropIndex
DROP INDEX `reviews_appointment_id_key` ON `reviews`;

-- AlterTable
ALTER TABLE `notifications` DROP COLUMN `appointment_id`,
    ADD COLUMN `booking_id` CHAR(36) NULL,
    MODIFY `type` ENUM('BOOKING_CREATED', 'BOOKING_CONFIRMED', 'BOOKING_REJECTED', 'BOOKING_COMPLETED', 'BOOKING_CANCELLED', 'STORE_APPROVED', 'STORE_REJECTED', 'STORE_LOCKED', 'STAFF_INVITED', 'PAYMENT_SUCCESS') NOT NULL;

-- AlterTable
ALTER TABLE `payments` DROP COLUMN `appointment_id`,
    ADD COLUMN `booking_id` CHAR(36) NOT NULL;

-- AlterTable
ALTER TABLE `reviews` DROP COLUMN `appointment_id`,
    ADD COLUMN `booking_id` CHAR(36) NOT NULL,
    ADD COLUMN `booking_item_id` CHAR(36) NOT NULL;

-- AlterTable
ALTER TABLE `system_logs` MODIFY `type` ENUM('AUTH_REGISTER', 'AUTH_LOGIN', 'AUTH_LOGOUT', 'STORE_CREATED', 'STORE_APPROVED', 'STORE_REJECTED', 'STORE_BANNED', 'STORE_UNLOCKED', 'USER_BANNED', 'USER_UNBANNED', 'PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'REVIEW_HIDDEN', 'REVIEW_SHOWN', 'BOOKING_CREATED', 'BOOKING_CONFIRMED', 'BOOKING_REJECTED', 'BOOKING_COMPLETED', 'BOOKING_CANCELLED') NOT NULL;

-- DropTable
DROP TABLE `appointments`;

-- CreateTable
CREATE TABLE `bookings` (
    `id` CHAR(36) NOT NULL,
    `customer_id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `total_duration` INTEGER NOT NULL,
    `total_price` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `cancellation_reason` TEXT NULL,
    `confirmed_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `bookings_customer_id_status_idx`(`customer_id`, `status`),
    INDEX `bookings_store_id_status_scheduled_at_idx`(`store_id`, `status`, `scheduled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_items` (
    `id` CHAR(36) NOT NULL,
    `booking_id` CHAR(36) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `service_id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NULL,
    `start_time` DATETIME(3) NOT NULL,
    `duration` INTEGER NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `booking_items_booking_id_idx`(`booking_id`),
    INDEX `booking_items_staff_id_start_time_idx`(`staff_id`, `start_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `payments_booking_id_idx` ON `payments`(`booking_id`);

-- CreateIndex
CREATE UNIQUE INDEX `reviews_booking_item_id_key` ON `reviews`(`booking_item_id`);

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `service_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_booking_item_id_fkey` FOREIGN KEY (`booking_item_id`) REFERENCES `booking_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
