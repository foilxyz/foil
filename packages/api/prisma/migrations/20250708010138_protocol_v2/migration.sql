/*
  Warnings:

  - You are about to drop the column `marketParamsClaimstatement` on the `market` table. All the data in the column will be lost.
  - You are about to drop the column `isYin` on the `market_group` table. All the data in the column will be lost.
  - You are about to drop the column `marketParamsClaimstatement` on the `market_group` table. All the data in the column will be lost.
  - You are about to drop the column `vaultAddress` on the `market_group` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "market" DROP COLUMN "marketParamsClaimstatement",
ADD COLUMN     "marketParamsClaimstatementNo" VARCHAR,
ADD COLUMN     "marketParamsClaimstatementYesOrNumeric" VARCHAR;

-- AlterTable
ALTER TABLE "market_group" DROP COLUMN "isYin",
DROP COLUMN "marketParamsClaimstatement",
DROP COLUMN "vaultAddress",
ADD COLUMN     "isBridged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketParamsClaimstatementNo" VARCHAR,
ADD COLUMN     "marketParamsClaimstatementYesOrNumeric" VARCHAR;
