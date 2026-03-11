-- AlterTable: add claimedTxId to Transfer for on-chain deduplication
ALTER TABLE "Transfer" ADD COLUMN "claimedTxId" TEXT NOT NULL DEFAULT '';
