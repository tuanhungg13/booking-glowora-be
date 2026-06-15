-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `customer_address` VARCHAR(300) NULL,
    ADD COLUMN `customer_province_id` INTEGER NULL,
    ADD COLUMN `customer_ward_id` INTEGER NULL;
