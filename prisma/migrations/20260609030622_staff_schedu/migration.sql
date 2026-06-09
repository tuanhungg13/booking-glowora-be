-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `call_in_id` CHAR(36) NULL,
    MODIFY `type` ENUM('BOOKING_CREATED', 'BOOKING_CONFIRMED', 'BOOKING_REJECTED', 'BOOKING_COMPLETED', 'BOOKING_CANCELLED', 'BOOKING_DEPOSIT_REQUIRED', 'BOOKING_DEPOSIT_PAID', 'BOOKING_DEPOSIT_EXPIRED', 'STORE_APPROVED', 'STORE_REJECTED', 'STORE_LOCKED', 'STAFF_INVITED', 'PAYMENT_SUCCESS', 'BOOKING_REMINDER_1DAY', 'BOOKING_REMINDER_1HOUR', 'STAFF_CALL_IN_REQUEST', 'STAFF_CALL_IN_ACCEPTED', 'STAFF_CALL_IN_REJECTED') NOT NULL;

-- CreateTable
CREATE TABLE `staff_call_ins` (
    `id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `start_time` VARCHAR(5) NULL,
    `end_time` VARCHAR(5) NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `staff_call_ins_store_id_date_idx`(`store_id`, `date`),
    UNIQUE INDEX `staff_call_ins_staff_id_date_key`(`staff_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `staff_call_ins` ADD CONSTRAINT `staff_call_ins_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_call_ins` ADD CONSTRAINT `staff_call_ins_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_call_in_id_fkey` FOREIGN KEY (`call_in_id`) REFERENCES `staff_call_ins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
