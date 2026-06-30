/*
  Warnings:

  - You are about to drop the column `mode` on the `conversations` table. All the data in the column will be lost.
  - The values [BOT] on the enum `messages_sender_type` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `conversations` DROP COLUMN `mode`;

-- AlterTable
ALTER TABLE `messages` MODIFY `sender_type` ENUM('CUSTOMER', 'STAFF') NOT NULL DEFAULT 'CUSTOMER';
