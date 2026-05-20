-- Bug fix: Staff.userId was @unique (one user = one store ever).
-- Changed to @@unique([userId, storeId]) so a user can be staff at multiple stores.
-- AlterTable
ALTER TABLE `staff` DROP INDEX `staff_user_id_key`,
    ADD UNIQUE INDEX `staff_user_id_store_id_key`(`user_id`, `store_id`);
