/*
  Warnings:

  - You are about to drop the column `comboId` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `serviceId` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `staffId` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `totalPrice` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `duration` on the `Combo` table. All the data in the column will be lost.
  - You are about to alter the column `price` on the `Combo` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `costPrice` on the `Material` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `price` on the `Service` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `costPrice` on the `Service` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - The primary key for the `UserRole` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[code,shopId]` on the table `Role` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,staffId,dayOfWeek,startTime,endTime]` on the table `StaffSchedule` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `durationMinutes` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `Combo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `Material` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `Role` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `StaffDayOff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `StaffSchedule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `UserRole` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `WorkingHour` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AppointmentItemStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AppointmentItemType" AS ENUM ('SERVICE', 'COMBO', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_comboId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_staffId_fkey";

-- DropIndex
DROP INDEX "Appointment_customerId_startTime_idx";

-- DropIndex
DROP INDEX "Appointment_staffId_startTime_idx";

-- DropIndex
DROP INDEX "Role_name_key";

-- DropIndex
DROP INDEX "StaffDayOff_staffId_date_idx";

-- DropIndex
DROP INDEX "StaffSchedule_staffId_dayOfWeek_idx";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "comboId",
DROP COLUMN "serviceId",
DROP COLUMN "staffId",
DROP COLUMN "totalPrice",
ADD COLUMN     "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'VND',
ADD COLUMN     "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "durationMinutes" INTEGER NOT NULL,
ADD COLUMN     "shopId" TEXT NOT NULL,
ADD COLUMN     "subtotal" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "total" DECIMAL(65,30) NOT NULL,
ALTER COLUMN "startTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "endTime" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "shopId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Combo" DROP COLUMN "duration",
ADD COLUMN     "estimatedDurationMinutes" INTEGER,
ADD COLUMN     "shopId" TEXT NOT NULL,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "shopId" TEXT NOT NULL,
ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shopId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopId" TEXT NOT NULL,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "StaffDayOff" ADD COLUMN     "shopId" TEXT NOT NULL,
ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "StaffSchedule" ADD COLUMN     "shopId" TEXT NOT NULL,
ALTER COLUMN "startTime" SET DATA TYPE TIME(0),
ALTER COLUMN "endTime" SET DATA TYPE TIME(0);

-- AlterTable
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_pkey",
ADD COLUMN     "shopId" TEXT NOT NULL,
ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "shopId", "roleId");

-- AlterTable
ALTER TABLE "WorkingHour" ADD COLUMN     "shopId" TEXT NOT NULL,
ALTER COLUMN "openTime" SET DATA TYPE TIME(0),
ALTER COLUMN "closeTime" SET DATA TYPE TIME(0);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "status" "ShopStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentItem" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "type" "AppointmentItemType" NOT NULL,
    "status" "AppointmentItemStatus" NOT NULL DEFAULT 'PENDING',
    "staffId" TEXT,
    "serviceId" TEXT,
    "comboId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "durationSnapshot" INTEGER NOT NULL,
    "bufferBeforeSnapshot" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterSnapshot" INTEGER NOT NULL DEFAULT 0,
    "unitPriceSnapshot" DECIMAL(65,30) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffBooking" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "appointmentItemId" TEXT,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentItem_appointmentId_idx" ON "AppointmentItem"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentItem_status_idx" ON "AppointmentItem"("status");

-- CreateIndex
CREATE INDEX "AppointmentItem_staffId_idx" ON "AppointmentItem"("staffId");

-- CreateIndex
CREATE INDEX "AppointmentItem_serviceId_idx" ON "AppointmentItem"("serviceId");

-- CreateIndex
CREATE INDEX "AppointmentItem_comboId_idx" ON "AppointmentItem"("comboId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentItem_appointmentId_sortOrder_key" ON "AppointmentItem"("appointmentId", "sortOrder");

-- CreateIndex
CREATE INDEX "StaffBooking_shopId_staffId_startTime_idx" ON "StaffBooking"("shopId", "staffId", "startTime");

-- CreateIndex
CREATE INDEX "StaffBooking_shopId_staffId_isActive_idx" ON "StaffBooking"("shopId", "staffId", "isActive");

-- CreateIndex
CREATE INDEX "StaffBooking_appointmentId_idx" ON "StaffBooking"("appointmentId");

-- CreateIndex
CREATE INDEX "StaffBooking_appointmentItemId_idx" ON "StaffBooking"("appointmentItemId");

-- CreateIndex
CREATE INDEX "StaffBooking_staffId_startTime_endTime_idx" ON "StaffBooking"("staffId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Appointment_shopId_customerId_startTime_idx" ON "Appointment"("shopId", "customerId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_shopId_key" ON "Role"("code", "shopId");

-- CreateIndex
CREATE INDEX "StaffDayOff_shopId_staffId_date_idx" ON "StaffDayOff"("shopId", "staffId", "date");

-- CreateIndex
CREATE INDEX "StaffSchedule_shopId_staffId_dayOfWeek_idx" ON "StaffSchedule"("shopId", "staffId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSchedule_shopId_staffId_dayOfWeek_startTime_endTime_key" ON "StaffSchedule"("shopId", "staffId", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "UserRole_shopId_userId_idx" ON "UserRole"("shopId", "userId");

-- CreateIndex
CREATE INDEX "WorkingHour_shopId_dayOfWeek_idx" ON "WorkingHour"("shopId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combo" ADD CONSTRAINT "Combo_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBooking" ADD CONSTRAINT "StaffBooking_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBooking" ADD CONSTRAINT "StaffBooking_appointmentItemId_fkey" FOREIGN KEY ("appointmentItemId") REFERENCES "AppointmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBooking" ADD CONSTRAINT "StaffBooking_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBooking" ADD CONSTRAINT "StaffBooking_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHour" ADD CONSTRAINT "WorkingHour_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSchedule" ADD CONSTRAINT "StaffSchedule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDayOff" ADD CONSTRAINT "StaffDayOff_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
