-- Additive only. Historical provider values, purchases and entitlements remain intact.
ALTER TABLE "Purchase" ALTER COLUMN "provider" SET DEFAULT 'dodo';
CREATE TABLE "BillingCheckout" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "plan" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "environment" TEXT NOT NULL,
  "sessionId" TEXT, "url" TEXT, "status" TEXT NOT NULL DEFAULT 'reserved',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BillingCheckout_userId_plan_environment_idx" ON "BillingCheckout"("userId", "plan", "environment");
CREATE UNIQUE INDEX "BillingCheckout_sessionId_key" ON "BillingCheckout"("sessionId");
CREATE INDEX "BillingCheckout_plan_status_idx" ON "BillingCheckout"("plan", "status");
CREATE TABLE "DodoSubscription" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "status" TEXT NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL, "eventAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DodoSubscription_userId_idx" ON "DodoSubscription"("userId");
CREATE TABLE "DodoPayment" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "subscriptionId" TEXT, "amount" INTEGER NOT NULL, "currency" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DodoPayment_subscriptionId_idx" ON "DodoPayment"("subscriptionId");
CREATE TABLE "DodoRefund" (
  "id" TEXT PRIMARY KEY, "paymentId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL, "full" BOOLEAN NOT NULL
);
CREATE INDEX "DodoRefund_paymentId_idx" ON "DodoRefund"("paymentId");
