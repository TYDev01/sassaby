-- Stacks is no longer a supported network: STX and USDCx are both delisted and
-- the monitor's Stacks adapter is gone. Bitcoin is the only self-custody chain
-- left, so it becomes the column default for rows written without an explicit
-- chain. Existing rows are not rewritten — a historical order's chain is a fact
-- about that order, not a setting.
ALTER TABLE "Transfer"       ALTER COLUMN "chain" SET DEFAULT 'bitcoin';
ALTER TABLE "DepositAddress" ALTER COLUMN "chain" SET DEFAULT 'bitcoin';

-- Drop any deposit address for a Stacks asset. Leaving one active would keep
-- publishing a receiving address for a token the desk will no longer settle.
DELETE FROM "DepositAddress" WHERE "chain" = 'stacks';
