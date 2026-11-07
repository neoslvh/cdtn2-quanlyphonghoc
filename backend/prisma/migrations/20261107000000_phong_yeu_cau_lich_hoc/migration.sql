-- DropTable
DROP TABLE "rooms";

-- CreateTable
CREATE TABLE "building" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "campus" VARCHAR(120),

    CONSTRAINT "building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "room_type" VARCHAR(30) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "qr_token" VARCHAR(255) NOT NULL,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" UUID NOT NULL,
    "room_id" UUID,
    "asset_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "equipment_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "qr_token" VARCHAR(255) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_slot" (
    "period_no" INTEGER NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,

    CONSTRAINT "period_slot_pkey" PRIMARY KEY ("period_no")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "id" UUID NOT NULL,
    "imported_by" UUID NOT NULL,
    "semester" VARCHAR(30) NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "session_count" INTEGER NOT NULL,
    "conflict_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedule" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "course_code" VARCHAR(50) NOT NULL,
    "course_name" VARCHAR(200) NOT NULL,
    "class_code" VARCHAR(50) NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(20) NOT NULL,

    CONSTRAINT "class_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_request" (
    "id" UUID NOT NULL,
    "request_no" SERIAL NOT NULL,
    "requester_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "participant_count" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "usage_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_equipment" (
    "request_id" UUID NOT NULL,
    "item_type" VARCHAR(30) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "other_description" TEXT,

    CONSTRAINT "request_equipment_pkey" PRIMARY KEY ("request_id","item_type")
);

-- CreateTable
CREATE TABLE "request_attachment" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_step" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "step_no" INTEGER NOT NULL,
    "approver_org_id" UUID NOT NULL,
    "approver_user_id" UUID,
    "status" VARCHAR(20) NOT NULL,
    "decision_reason" TEXT,
    "decided_at" TIMESTAMPTZ,

    CONSTRAINT "approval_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_booking" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "building_code_key" ON "building"("code");

-- CreateIndex
CREATE UNIQUE INDEX "room_code_key" ON "room"("code");

-- CreateIndex
CREATE UNIQUE INDEX "room_qr_token_key" ON "room"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_asset_code_key" ON "equipment"("asset_code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_qr_token_key" ON "equipment"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "usage_request_request_no_key" ON "usage_request"("request_no");

-- CreateIndex
CREATE UNIQUE INDEX "room_booking_request_id_key" ON "room_booking"("request_id");

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_request" ADD CONSTRAINT "usage_request_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_request" ADD CONSTRAINT "usage_request_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_request" ADD CONSTRAINT "usage_request_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_equipment" ADD CONSTRAINT "request_equipment_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "usage_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_attachment" ADD CONSTRAINT "request_attachment_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "usage_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_attachment" ADD CONSTRAINT "request_attachment_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "usage_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_approver_org_id_fkey" FOREIGN KEY ("approver_org_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "usage_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phòng trống cần chặn trùng giờ ở tầng cơ sở dữ liệu: hai lượt đặt ACTIVE không được chồng giờ trên một phòng (BR-01).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_no_overlap" EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_at", "end_at") WITH &&) WHERE ("status" = 'ACTIVE');

-- Tra cứu buổi học theo phòng và khoảng thời gian (BR-10).
CREATE INDEX "class_schedule_room_time_idx" ON "class_schedule" USING gist ("room_id", tstzrange("start_at", "end_at"));

-- Ràng buộc giá trị.
ALTER TABLE "room" ADD CONSTRAINT "room_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "usage_request" ADD CONSTRAINT "usage_request_time_order" CHECK ("end_at" > "start_at");
ALTER TABLE "usage_request" ADD CONSTRAINT "usage_request_participants_positive" CHECK ("participant_count" > 0);
ALTER TABLE "request_equipment" ADD CONSTRAINT "request_equipment_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "request_equipment" ADD CONSTRAINT "request_equipment_other_description" CHECK ("item_type" <> 'OTHER' OR "other_description" IS NOT NULL);
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_time_order" CHECK ("end_at" > "start_at");
ALTER TABLE "period_slot" ADD CONSTRAINT "period_slot_time_order" CHECK ("end_time" > "start_time");
