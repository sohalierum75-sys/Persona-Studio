-- ── Paddle migration: rename provider-specific columns to generic names ────────
--
-- Renames Lemon Squeezy-named Purchase columns to provider-agnostic names so
-- the same ledger stores both historic LS records and new Paddle records.
-- All data is preserved; only column names change.
--
-- 1. Rename columns (PostgreSQL preserves indexes that reference the old name
--    when RENAME COLUMN is used, including the partial unique indexes).
-- 2. Drop the old LS-named unique indexes and recreate them under new names
--    so pg_dump output and Prisma introspection match the schema exactly.
-- 3. Update the Purchase.provider default to 'paddle' for new rows; existing
--    LS rows retain their 'lemonsqueezy' provider value as historical data.

-- Step 1: rename columns
ALTER TABLE "Purchase" RENAME COLUMN "lsOrderId"        TO "providerOrderId";
ALTER TABLE "Purchase" RENAME COLUMN "lsSubscriptionId" TO "providerSubscriptionId";
ALTER TABLE "Purchase" RENAME COLUMN "lsVariantId"      TO "providerPriceId";

-- Step 2: rename indexes to match new column names
ALTER INDEX "Purchase_lsOrderId_key"        RENAME TO "Purchase_providerOrderId_key";
ALTER INDEX "Purchase_lsSubscriptionId_key" RENAME TO "Purchase_providerSubscriptionId_key";

-- Step 3: change default provider for new rows
ALTER TABLE "Purchase" ALTER COLUMN "provider" SET DEFAULT 'paddle';
