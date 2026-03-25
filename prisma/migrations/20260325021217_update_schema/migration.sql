/*
  Warnings:

  - You are about to drop the column `isActive` on the `StaffBooking` table. All the data in the column will be lost.
  - Made the column `stockQuantity` on table `Material` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `userId` to the `Review` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StaffBookingStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('CHARGE', 'REFUND', 'PARTIAL_REFUND');

-- AlterEnum
ALTER TYPE "AppointmentItemStatus" ADD VALUE 'IN_PROGRESS';

-- AlterEnum
ALTER TYPE "AppointmentItemType" ADD VALUE 'COMBO_CHILD';

-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'IN_PROGRESS';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- DropIndex
DROP INDEX "StaffBooking_shopId_staffId_isActive_idx";

-- AlterTable
ALTER TABLE "AppointmentItem" ADD COLUMN     "parentItemId" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "assignedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Material" ALTER COLUMN "stockQuantity" SET NOT NULL,
ALTER COLUMN "stockQuantity" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

-- AlterTable
ALTER TABLE "StaffBooking" DROP COLUMN "isActive",
ADD COLUMN     "status" "StaffBookingStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" "PaymentTransactionType" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "providerTxnId" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentId_idx" ON "PaymentTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_providerTxnId_idx" ON "PaymentTransaction"("providerTxnId");

-- CreateIndex
CREATE INDEX "AppointmentItem_parentItemId_idx" ON "AppointmentItem"("parentItemId");

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- CreateIndex
CREATE INDEX "Role_code_idx" ON "Role"("code");

-- CreateIndex
CREATE INDEX "Role_shopId_idx" ON "Role"("shopId");

-- CreateIndex
CREATE INDEX "StaffBooking_shopId_staffId_status_idx" ON "StaffBooking"("shopId", "staffId", "status");

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "AppointmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
