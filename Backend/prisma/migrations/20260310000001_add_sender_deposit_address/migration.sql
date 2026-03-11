-- AlterTable: add senderAddress and depositAddress to Transfer
ALTER TABLE "Transfer" ADD COLUMN "senderAddress"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "Transfer" ADD COLUMN "depositAddress" TEXT NOT NULL DEFAULT '';
