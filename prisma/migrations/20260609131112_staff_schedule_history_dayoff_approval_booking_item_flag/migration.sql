-- AlterTable
ALTER TABLE `booking_items` ADD COLUMN `is_staff_chosen_by_customer` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `day_off_id` CHAR(36) NULL,
    MODIFY `type` ENUM('BOOKING_CREATED', 'BOOKING_CONFIRMED', 'BOOKING_REJECTED', 'BOOKING_COMPLETED', 'BOOKING_CANCELLED', 'BOOKING_DEPOSIT_REQUIRED', 'BOOKING_DEPOSIT_PAID', 'BOOKING_DEPOSIT_EXPIRED', 'STORE_APPROVED', 'STORE_REJECTED', 'STORE_LOCKED', 'STAFF_INVITED', 'PAYMENT_SUCCESS', 'BOOKING_REMINDER_1DAY', 'BOOKING_REMINDER_1HOUR', 'STAFF_CALL_IN_REQUEST', 'STAFF_CALL_IN_ACCEPTED', 'STAFF_CALL_IN_REJECTED', 'STAFF_DAY_OFF_REQUEST', 'STAFF_DAY_OFF_APPROVED', 'STAFF_DAY_OFF_REJECTED') NOT NULL;

-- AlterTable
ALTER TABLE `staff_day_offs` ADD COLUMN `end_time` VARCHAR(5) NULL,
    ADD COLUMN `review_note` VARCHAR(191) NULL,
    ADD COLUMN `reviewed_at` DATETIME(3) NULL,
    ADD COLUMN `reviewed_by` CHAR(36) NULL,
    ADD COLUMN `start_time` VARCHAR(5) NULL,
    ADD COLUMN `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE `staff_schedule_histories` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `day_of_week` ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY') NOT NULL,
    `start_time` VARCHAR(5) NOT NULL,
    `end_time` VARCHAR(5) NOT NULL,
    `is_active` BOOLEAN NOT NULL,
    `effective_from` DATETIME(3) NOT NULL,
    `effective_to` DATETIME(3) NOT NULL,
    `changed_by` CHAR(36) NULL,

    INDEX `staff_schedule_histories_staff_id_effective_to_idx`(`staff_id`, `effective_to`),
    INDEX `staff_schedule_histories_store_id_effective_to_idx`(`store_id`, `effective_to`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `staff_day_offs_store_id_status_idx` ON `staff_day_offs`(`store_id`, `status`);

-- AddForeignKey
ALTER TABLE `staff_schedule_histories` ADD CONSTRAINT `staff_schedule_histories_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_schedule_histories` ADD CONSTRAINT `staff_schedule_histories_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_day_off_id_fkey` FOREIGN KEY (`day_off_id`) REFERENCES `staff_day_offs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
