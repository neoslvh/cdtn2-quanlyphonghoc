-- FR-18 check-in bằng QR (SCRUM-23) và FR-19 báo hỏng thiết bị (SCRUM-24), theo ERD v4.1.
CREATE TABLE "checkin" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMPTZ NOT NULL,
    "result" VARCHAR(20) NOT NULL,

    CONSTRAINT "checkin_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "checkin_result_valid" CHECK ("result" IN ('SUCCESS'))
);
CREATE UNIQUE INDEX "checkin_request_id_key" ON "checkin"("request_id");
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "usage_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- image_name giữ tên gốc của ảnh để hiển thị; image_path là tên tệp do máy chủ đặt.
CREATE TABLE "incident_report" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "reported_by" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "image_path" VARCHAR(500),
    "image_name" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_report_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "incident_report_status_valid" CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'RESOLVED'))
);
CREATE INDEX "incident_report_status_created_at_idx" ON "incident_report"("status", "created_at");
ALTER TABLE "incident_report" ADD CONSTRAINT "incident_report_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "usage_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_report" ADD CONSTRAINT "incident_report_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incident_report" ADD CONSTRAINT "incident_report_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
