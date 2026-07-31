-- DropIndex
DROP INDEX "Holding_userId_symbol_accountType_key";
-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "institution" TEXT NOT NULL DEFAULT '';
-- CreateIndex
CREATE UNIQUE INDEX "Holding_userId_symbol_accountType_institution_key" ON "Holding"("userId", "symbol", "accountType", "institution");
