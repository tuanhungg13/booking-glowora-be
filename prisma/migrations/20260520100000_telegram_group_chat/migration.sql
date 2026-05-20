-- AlterTable: add telegramGroupId to stores
ALTER TABLE `stores` ADD COLUMN `telegram_group_id` VARCHAR(50) NULL;

-- AlterTable: add telegramTopicId to conversations
ALTER TABLE `conversations` ADD COLUMN `telegram_topic_id` INT NULL;
