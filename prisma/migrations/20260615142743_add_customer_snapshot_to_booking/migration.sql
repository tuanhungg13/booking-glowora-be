-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `customer_email` VARCHAR(150) NULL,
    ADD COLUMN `customer_name` VARCHAR(150) NULL,
    ADD COLUMN `customer_phone` VARCHAR(20) NULL;
