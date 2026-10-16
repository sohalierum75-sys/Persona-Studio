-- Additive dispute ledger; existing purchases and access remain unchanged.
CREATE TABLE "DodoDispute" (
  "id" TEXT PRIMARY KEY,
  "paymentId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DodoDispute_paymentId_idx" ON "DodoDispute"("paymentId");
