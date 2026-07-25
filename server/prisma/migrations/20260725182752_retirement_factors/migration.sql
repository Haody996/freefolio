-- CreateEnum
CREATE TYPE "WithdrawalStrategy" AS ENUM ('FIXED', 'GUARDRAILS');
-- AlterTable
ALTER TABLE "ProjectionSettings" ADD COLUMN     "applyRmd" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aumFeePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fireGoal" DOUBLE PRECISION,
ADD COLUMN     "healthcareAnnual" DOUBLE PRECISION NOT NULL DEFAULT 6000,
ADD COLUMN     "healthcareInflationPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
ADD COLUMN     "spendingSmile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "withdrawalStrategy" "WithdrawalStrategy" NOT NULL DEFAULT 'FIXED';
