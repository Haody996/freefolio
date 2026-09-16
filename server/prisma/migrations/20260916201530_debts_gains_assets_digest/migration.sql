-- CreateEnum
CREATE TYPE "TxSource" AS ENUM ('MANUAL', 'ADD', 'AUTO_INVEST');

-- CreateEnum
CREATE TYPE "LiabilityType" AS ENUM ('MORTGAGE', 'HELOC', 'AUTO_LOAN', 'STUDENT_LOAN', 'CREDIT_CARD', 'PERSONAL_LOAN', 'MEDICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DebtStrategy" AS ENUM ('AVALANCHE', 'SNOWBALL');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('OFF', 'WEEKLY', 'MONTHLY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Category" ADD VALUE 'METALS';
ALTER TYPE "Category" ADD VALUE 'REAL_ESTATE';
ALTER TYPE "Category" ADD VALUE 'VEHICLE';

-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "appreciationPct" DOUBLE PRECISION,
ADD COLUMN     "openingAcquiredAt" TIMESTAMP(3),
ADD COLUMN     "openingCostPerShare" DOUBLE PRECISION,
ADD COLUMN     "providerId" TEXT;

-- AlterTable
ALTER TABLE "ProjectionSettings" ADD COLUMN     "debtExtraPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "debtStrategy" "DebtStrategy" NOT NULL DEFAULT 'AVALANCHE',
ADD COLUMN     "redirectDebtPayments" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "source" "TxSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "lastDigestAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Liability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LiabilityType" NOT NULL DEFAULT 'OTHER',
    "institution" TEXT NOT NULL DEFAULT '',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holdingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Liability_userId_idx" ON "Liability"("userId");

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
