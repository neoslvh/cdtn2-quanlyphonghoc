CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "room_type" TEXT NOT NULL DEFAULT 'CLASSROOM',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS "room_booking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "room_id" INTEGER NOT NULL,
  "start_at" TIMESTAMPTZ NOT NULL,
  "end_at" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "room_booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "room_booking_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "room_booking_time_check" CHECK ("end_at" > "start_at")
);
CREATE INDEX IF NOT EXISTS "room_booking_room_id_start_at_end_at_idx" ON "room_booking" ("room_id", "start_at", "end_at");
CREATE EXTENSION IF NOT EXISTS "btree_gist";
DO $$ BEGIN
  ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_active_no_overlap"
  EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_at", "end_at", '[)') WITH &&)
  WHERE ("status" = 'ACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "class_schedule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "room_id" INTEGER NOT NULL,
  "course_code" TEXT NOT NULL,
  "class_code" TEXT NOT NULL,
  "start_at" TIMESTAMPTZ NOT NULL,
  "end_at" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "class_schedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_schedule_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "class_schedule_time_check" CHECK ("end_at" > "start_at")
);
CREATE INDEX IF NOT EXISTS "class_schedule_room_id_start_at_end_at_idx" ON "class_schedule" ("room_id", "start_at", "end_at");

CREATE TABLE IF NOT EXISTS "equipment" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "room_id" INTEGER NULL REFERENCES "rooms"("id"), "asset_code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "equipment_type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE IF NOT EXISTS "usage_request" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "requester_id" UUID NOT NULL REFERENCES "user"("id"), "organization_id" UUID NOT NULL REFERENCES "organization"("id"), "room_id" INTEGER NOT NULL REFERENCES "rooms"("id"), "purpose" TEXT NOT NULL, "start_at" TIMESTAMPTZ NOT NULL, "end_at" TIMESTAMPTZ NOT NULL, "participant_count" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "submitted_at" TIMESTAMPTZ NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK ("end_at" > "start_at"));
CREATE INDEX IF NOT EXISTS "usage_request_room_id_start_at_end_at_idx" ON "usage_request" ("room_id", "start_at", "end_at");
CREATE TABLE IF NOT EXISTS "request_equipment" ("request_id" UUID NOT NULL REFERENCES "usage_request"("id") ON DELETE CASCADE, "equipment_id" UUID NOT NULL REFERENCES "equipment"("id"), "quantity" INTEGER NOT NULL DEFAULT 1, PRIMARY KEY ("request_id", "equipment_id"));

CREATE TABLE IF NOT EXISTS "approval_rule" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT TRUE, "conditions" JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS "approval_step" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "request_id" UUID NOT NULL REFERENCES "usage_request"("id") ON DELETE CASCADE, "step_number" INTEGER NOT NULL, "organization_id" UUID NULL REFERENCES "organization"("id"), "status" TEXT NOT NULL DEFAULT 'PENDING', "approver_user_id" UUID NULL REFERENCES "user"("id"), "decision_at" TIMESTAMPTZ NULL, "reason" TEXT NULL, UNIQUE ("request_id", "step_number"));
CREATE TABLE IF NOT EXISTS "notification" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL REFERENCES "user"("id"), "request_id" UUID NULL REFERENCES "usage_request"("id"), "title" TEXT NOT NULL, "body" TEXT NOT NULL, "read_at" TIMESTAMPTZ NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "audit_log" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" UUID NULL REFERENCES "user"("id"), "action" TEXT NOT NULL, "entity_type" TEXT NOT NULL, "entity_id" UUID NOT NULL, "before_data" JSONB NULL, "after_data" JSONB NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "period_slot" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "slot_number" INTEGER NOT NULL UNIQUE, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, CHECK ("end_time" > "start_time"));
CREATE TABLE IF NOT EXISTS "import_batch" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "semester" TEXT NOT NULL, "mode" TEXT NOT NULL, "created_by" UUID NOT NULL REFERENCES "user"("id"), "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "status" TEXT NOT NULL DEFAULT 'PREVIEW');
ALTER TABLE "class_schedule" ADD COLUMN IF NOT EXISTS "semester" TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS "course_name" TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS "import_batch_id" UUID NULL REFERENCES "import_batch"("id"), ADD COLUMN IF NOT EXISTS "created_by" UUID NULL REFERENCES "user"("id");

CREATE TABLE IF NOT EXISTS "building" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "code" VARCHAR(30) NOT NULL UNIQUE, "name" VARCHAR(150) NOT NULL, "campus" VARCHAR(120) NOT NULL);
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "building_id" UUID NULL;
INSERT INTO "building" ("code", "name", "campus")
SELECT DISTINCT regexp_replace("building", '[^A-Za-z0-9]+', '_', 'g'), "building", 'Cơ sở chính'
FROM "rooms" WHERE "building" <> ''
ON CONFLICT ("code") DO NOTHING;
UPDATE "rooms" r SET "building_id" = b."id" FROM "building" b
WHERE r."building_id" IS NULL AND b."name" = r."building";
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_building_id_fkey";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "building"("id");
CREATE TABLE IF NOT EXISTS "request_attachment" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "request_id" UUID NOT NULL REFERENCES "usage_request"("id") ON DELETE CASCADE, "file_name" VARCHAR(255) NOT NULL, "file_path" VARCHAR(500) NOT NULL, "mime_type" VARCHAR(100) NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "usage_handover" ("request_id" UUID PRIMARY KEY REFERENCES "usage_request"("id"), "handed_over_by" UUID NOT NULL REFERENCES "user"("id"), "handed_over_at" TIMESTAMPTZ NOT NULL, "returned_by" UUID NULL REFERENCES "user"("id"), "returned_at" TIMESTAMPTZ NULL, "condition_note" TEXT NULL, CHECK ("returned_at" IS NULL OR "returned_at" >= "handed_over_at"));
CREATE TABLE IF NOT EXISTS "checkin" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "request_id" UUID NOT NULL UNIQUE REFERENCES "usage_request"("id"), "user_id" UUID NOT NULL REFERENCES "user"("id"), "room_id" INTEGER NOT NULL REFERENCES "rooms"("id"), "checked_in_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "result" VARCHAR(20) NOT NULL);
CREATE TABLE IF NOT EXISTS "incident_report" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "request_id" UUID NOT NULL REFERENCES "usage_request"("id"), "equipment_id" UUID NOT NULL REFERENCES "equipment"("id"), "reported_by" UUID NOT NULL REFERENCES "user"("id"), "description" TEXT NOT NULL, "image_path" VARCHAR(500) NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN', "created_at" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "maintenance_ticket" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "incident_id" UUID NOT NULL UNIQUE REFERENCES "incident_report"("id"), "equipment_id" UUID NOT NULL REFERENCES "equipment"("id"), "created_by" UUID NOT NULL REFERENCES "user"("id"), "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN', "started_at" TIMESTAMPTZ NULL, "completed_at" TIMESTAMPTZ NULL, "note" TEXT NULL, CHECK ("completed_at" IS NULL OR "started_at" IS NULL OR "completed_at" >= "started_at"));
