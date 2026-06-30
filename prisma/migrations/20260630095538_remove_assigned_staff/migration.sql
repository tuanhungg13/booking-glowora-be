/*
  Warnings:

  - You are about to drop the column `assigned_staff_id` on the `conversations` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `conversations` DROP FOREIGN KEY `conversations_assigned_staff_id_fkey`;

-- DropIndex
DROP INDEX `conversations_assigned_staff_id_fkey` ON `conversations`;

-- AlterTable
ALTER TABLE `conversations` DROP COLUMN `assigned_staff_id`;
