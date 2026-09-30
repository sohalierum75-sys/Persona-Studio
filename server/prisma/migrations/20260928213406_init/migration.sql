-- Compatibility migration: may precede the initial schema on a fresh database.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Entity' AND table_schema = current_schema()) THEN
   ALTER TABLE "Entity" ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);
 END IF;
END $$;
