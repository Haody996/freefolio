
-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('TAXABLE', 'TRADITIONAL_401K', 'ROTH_401K', 'TRADITIONAL_IRA', 'ROTH_IRA', 'HSA', 'OTHER');

-- DropIndex
DROP INDEX "Holding_userId_symbol_key";

-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'TAXABLE';

-- CreateIndex
CREATE UNIQUE INDEX "Holding_userId_symbol_accountType_key" ON "Holding"("userId", "symbol", "accountType");

