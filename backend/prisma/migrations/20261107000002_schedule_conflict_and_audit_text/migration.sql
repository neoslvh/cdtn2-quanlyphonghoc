CREATE EXTENSION IF NOT EXISTS "btree_gist";

DO $$ BEGIN
  ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_active_no_overlap"
  EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_at", "end_at", '[)') WITH &&)
  WHERE ("status" = 'ACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "audit_log"
  ALTER COLUMN "entity_id" TYPE TEXT USING "entity_id"::text;
