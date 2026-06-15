-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_customer_province_id_fkey` FOREIGN KEY (`customer_province_id`) REFERENCES `provinces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_customer_ward_id_fkey` FOREIGN KEY (`customer_ward_id`) REFERENCES `wards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
