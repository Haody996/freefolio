-- CreateEnum
CREATE TYPE "AutoFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY');
-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "autoAmount" DOUBLE PRECISION,
ADD COLUMN     "autoFrequency" "AutoFrequency",
ADD COLUMN     "autoLastAt" TIMESTAMP(3),
ADD COLUMN     "autoNextAt" TIMESTAMP(3);
