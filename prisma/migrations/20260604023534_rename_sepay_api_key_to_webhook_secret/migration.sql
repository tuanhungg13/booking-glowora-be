/*
  Warnings:

  - You are about to drop the column `sepay_api_key` on the `store_payment_configs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `store_payment_configs` DROP COLUMN `sepay_api_key`,
    ADD COLUMN `webhook_secret` CHAR(64) NULL;
