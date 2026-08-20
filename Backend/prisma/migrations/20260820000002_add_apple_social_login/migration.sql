-- Login with Apple. Mirrors the googleId column added in the previous
-- migration: nullable, unique, and NULLs are distinct in a Postgres unique
-- index, so every existing row stays valid.
ALTER TABLE "User" ADD COLUMN "appleId" TEXT;
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");
