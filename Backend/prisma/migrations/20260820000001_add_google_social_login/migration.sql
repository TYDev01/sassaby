-- Social login (Google).
--
-- `password` becomes nullable: an account created through Google has no
-- password to hash, and storing a dummy hash would make "can this user log in
-- with a password?" unanswerable.
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- Google's `sub` claim. Unique so one Google identity cannot be attached to two
-- accounts. Nullable, and Postgres treats NULLs as distinct in a unique index,
-- so every existing password-only row stays valid.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- Existing rows are all password signups, which verify nothing, so the default
-- of false is correct for the backfill as well as for new rows.
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
