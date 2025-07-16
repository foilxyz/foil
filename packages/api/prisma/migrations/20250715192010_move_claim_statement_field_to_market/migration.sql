/*
  Warnings:

  - You are about to drop the column `marketParamsClaimstatementNo` on the `market_group` table. All the data in the column will be lost.
  - You are about to drop the column `marketParamsClaimstatementYesOrNumeric` on the `market_group` table. All the data in the column will be lost.

*/

-- AlterTable
ALTER TABLE "market_group" DROP COLUMN "marketParamsClaimstatementNo",
DROP COLUMN "marketParamsClaimstatementYesOrNumeric";

-- AlterTable
ALTER TABLE market 
RENAME COLUMN "marketParamsClaimstatementYesOrNumeric" TO "claimStatementYesOrNumeric";

-- AlterTable
ALTER TABLE "market" 
RENAME COLUMN "marketParamsClaimstatementNo" TO "claimStatementNo";
