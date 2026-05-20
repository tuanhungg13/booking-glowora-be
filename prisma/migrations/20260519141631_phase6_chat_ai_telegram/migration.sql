-- AlterTable
ALTER TABLE `conversations` ADD COLUMN `assigned_staff_id` CHAR(36) NULL,
    ADD COLUMN `mode` ENUM('BOT', 'HUMAN') NOT NULL DEFAULT 'BOT';

-- AlterTable
ALTER TABLE `messages` ADD COLUMN `sender_type` ENUM('CUSTOMER', 'STAFF', 'BOT') NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE `staff` ADD COLUMN `telegram_chat_id` VARCHAR(50) NULL,
    ADD COLUMN `telegram_link_token` VARCHAR(100) NULL;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_assigned_staff_id_fkey` FOREIGN KEY (`assigned_staff_id`) REFERENCES `staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
