ALTER TABLE "AuthCode" ADD COLUMN "challenge" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Entity" ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityVersion_entity_fkey' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "EntityVersion" RENAME CONSTRAINT "EntityVersion_entity_fkey" TO "EntityVersion_userId_entityId_fkey";
 END IF;
END $$;
CREATE TABLE "OperationReceipt" (
 "userId" TEXT NOT NULL, "opId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("userId", "opId")
);
