-- DropForeignKey
ALTER TABLE `staff_services` DROP FOREIGN KEY `staff_services_staff_id_fkey`;

-- DropForeignKey
ALTER TABLE `staff_services` DROP FOREIGN KEY `staff_services_service_id_fkey`;

-- DropTable
DROP TABLE `staff_services`;
