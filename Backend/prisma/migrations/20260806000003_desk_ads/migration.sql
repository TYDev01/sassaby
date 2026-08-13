-- Mirror of the ads this desk publishes on Bitget.
--
-- The UTA P2P API exposes a public ad book but no confirmed "my ads" endpoint,
-- so the desk records what it publishes and prices quotes off this table.

CREATE TABLE "DeskAd" (
    "advId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fiat" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "priceType" TEXT NOT NULL DEFAULT 'fixed',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeskAd_pkey" PRIMARY KEY ("advId")
);

CREATE INDEX "DeskAd_fiat_side_active_idx" ON "DeskAd"("fiat", "side", "active");
