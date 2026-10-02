-- ── Billing: entitlements on User ─────────────────────────────
ALTER TABLE "User" ADD COLUMN "lifetimeAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "subscriptionEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "subscriptionId" TEXT;

CREATE UNIQUE INDEX "User_subscriptionId_key" ON "User"("subscriptionId");

-- ── Purchase ledger (written only by verified webhooks) ───────
CREATE TABLE "Purchase" (
    "id"               TEXT NOT NULL,
    "provider"         TEXT NOT NULL DEFAULT 'lemonsqueezy',
    "kind"             TEXT NOT NULL,
    "status"           TEXT NOT NULL,
    "userId"           TEXT,
    "email"            TEXT NOT NULL,
    "lsOrderId"        TEXT,
    "lsSubscriptionId" TEXT,
    "lsVariantId"      TEXT NOT NULL,
    "amountCents"      INTEGER NOT NULL,
    "currency"         TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Purchase_lsOrderId_key"        ON "Purchase"("lsOrderId");
CREATE UNIQUE INDEX "Purchase_lsSubscriptionId_key" ON "Purchase"("lsSubscriptionId");
CREATE INDEX "Purchase_kind_status_idx"             ON "Purchase"("kind", "status");
CREATE INDEX "Purchase_userId_idx"                  ON "Purchase"("userId");

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Webhook idempotency ────────────────────────────────────────
CREATE TABLE "BillingEvent" (
    "id"        TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload"   JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);
