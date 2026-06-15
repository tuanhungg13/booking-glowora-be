-- AlterTable
ALTER TABLE `staff` ADD COLUMN `address` VARCHAR(300) NULL,
    ADD COLUMN `phone` VARCHAR(20) NULL,
    ADD COLUMN `province_id` INTEGER NULL,
    ADD COLUMN `ward_id` INTEGER NULL,
    MODIFY `status` ENUM('ACTIVE', 'INACTIVE', 'DELETED') NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `address` VARCHAR(300) NULL,
    ADD COLUMN `province_id` INTEGER NULL,
    ADD COLUMN `ward_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_province_id_fkey` FOREIGN KEY (`province_id`) REFERENCES `provinces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_ward_id_fkey` FOREIGN KEY (`ward_id`) REFERENCES `wards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_province_id_fkey` FOREIGN KEY (`province_id`) REFERENCES `provinces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_ward_id_fkey` FOREIGN KEY (`ward_id`) REFERENCES `wards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
