/*
  Warnings:

  - You are about to drop the column `cost_price` on the `service_variants` table. All the data in the column will be lost.
  - You are about to drop the column `telegram_chat_id` on the `staff` table. All the data in the column will be lost.
  - You are about to drop the column `telegram_link_token` on the `staff` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `service_variants` DROP COLUMN `cost_price`;

-- AlterTable
ALTER TABLE `staff` DROP COLUMN `telegram_chat_id`,
    DROP COLUMN `telegram_link_token`;
