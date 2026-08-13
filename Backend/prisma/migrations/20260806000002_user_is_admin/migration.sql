-- Operator access flag.
--
-- Replaces the old wallet-address admin check, which was cosmetic: it only chose
-- which UI to render while the Next.js proxy routes attached ADMIN_API_KEY to any
-- caller. Grant this deliberately, in SQL:
--
--   UPDATE "User" SET "isAdmin" = true WHERE email = 'you@example.com';

ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
