-- ─────────────────────────────────────────────────────────────────────────────
-- P2P desk rebuild: users, bidirectional orders, per-chain deposit addresses.
--
-- Non-destructive to settled history.  Existing transfers are preserved and
-- reparented to a locked placeholder user.
--
-- ONE EXCEPTION, deliberate: legacy orders still in a non-terminal state are
-- moved to 'expired'.  They depended on the automatic Flutterwave payout that
-- this branch removes, so they can never complete; and leaving them open would
-- violate the one-open-order-per-user index created at the end of this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "fullName" TEXT NOT NULL DEFAULT '',
    "bankAccountName" TEXT NOT NULL DEFAULT '',
    "kycTier" TEXT NOT NULL DEFAULT 'light',
    "banned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Placeholder owner for pre-auth history.  '!' is not a valid bcrypt hash, so
-- password comparison can never succeed; `banned` blocks it regardless.
INSERT INTO "User" ("id", "email", "password", "fullName", "banned")
VALUES ('legacy-import', 'legacy@sassaby.invalid', '!', 'Legacy (pre-auth) orders', true);

-- ─── Transfer: new columns ───────────────────────────────────────────────────

ALTER TABLE "Transfer"
    ADD COLUMN "chain" TEXT NOT NULL DEFAULT 'stacks',
    ADD COLUMN "destinationAddress" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'sell',
    ADD COLUMN "evidenceRef" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "rejectionReason" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "releasedAt" TIMESTAMP(3),
    ADD COLUMN "releasedBy" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "userId" TEXT,
    ALTER COLUMN "bank" SET DEFAULT '',
    ALTER COLUMN "bankCode" SET DEFAULT '',
    ALTER COLUMN "accountNumber" SET DEFAULT '',
    ALTER COLUMN "status" SET DEFAULT 'awaiting_deposit';

-- Backfill ownership, then enforce NOT NULL.  Adding the column as NOT NULL up
-- front would fail against any existing row.
UPDATE "Transfer" SET "userId" = 'legacy-import' WHERE "userId" IS NULL;
ALTER TABLE "Transfer" ALTER COLUMN "userId" SET NOT NULL;

-- ─── Transfer: backfill chain from the old token-only model ──────────────────

UPDATE "Transfer" SET "chain" = 'bitcoin' WHERE "sendToken" = 'BTC';
UPDATE "Transfer" SET "chain" = 'stacks'  WHERE "sendToken" IN ('STX', 'USDCx');

-- ─── Transfer: map old statuses onto the bidirectional state machine ─────────
-- Old: pending | processing | completed | failed
-- New (sell leg): awaiting_deposit → deposit_confirmed → awaiting_manual_payout → settled

UPDATE "Transfer" SET "status" = 'settled'           WHERE "status" = 'completed';
UPDATE "Transfer" SET "status" = 'deposit_confirmed' WHERE "status" = 'processing';
UPDATE "Transfer" SET "status" = 'awaiting_deposit'  WHERE "status" = 'pending';

-- Close out legacy orders that can no longer complete (see header note).
UPDATE "Transfer"
   SET "status" = 'expired'
 WHERE "userId" = 'legacy-import'
   AND "status" IN ('awaiting_deposit', 'deposit_confirmed', 'awaiting_manual_payout');

-- ─── DepositAddress: per-chain addressing ────────────────────────────────────

ALTER TABLE "DepositAddress"
    ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "chain" TEXT NOT NULL DEFAULT 'stacks',
    ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'self',
    ADD COLUMN "memo" TEXT NOT NULL DEFAULT '';

UPDATE "DepositAddress" SET "chain" = 'bitcoin' WHERE "token" = 'BTC';
UPDATE "DepositAddress" SET "chain" = 'stacks'  WHERE "token" IN ('STX', 'USDCx');

-- token alone is no longer unique: USDT lives on Tron, Ethereum and BSC at
-- three different addresses.
DROP INDEX "DepositAddress_token_key";
CREATE UNIQUE INDEX "DepositAddress_token_chain_key" ON "DepositAddress"("token", "chain");

-- ─── Indexes and foreign key ─────────────────────────────────────────────────

CREATE INDEX "Transfer_userId_status_idx" ON "Transfer"("userId", "status");
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");

ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── One open order per user ─────────────────────────────────────────────────
-- The correctness guard behind the client-side disabled-button UX.  A disabled
-- button does not survive two tabs, refresh-and-retry, a network retry, or a
-- direct API call; this does.
--
-- Hand-written because Prisma cannot express partial unique indexes in the
-- schema — keep it in sync manually if the open-status set ever changes.

CREATE UNIQUE INDEX "one_open_order_per_user"
    ON "Transfer" ("userId")
 WHERE "status" IN (
    -- buy leg
    'awaiting_payment', 'payment_claimed', 'verifying',
    -- sell leg
    'awaiting_deposit', 'deposit_confirmed', 'awaiting_manual_payout'
 );
