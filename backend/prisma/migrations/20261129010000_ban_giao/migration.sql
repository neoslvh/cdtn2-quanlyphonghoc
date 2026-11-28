-- FR-17 bàn giao và nhận trả phòng (SCRUM-22), theo bảng usage_handover của ERD v4.1.
-- Thêm return_note và hai danh sách thiết bị (handover_items, return_items) để lưu tình trạng trước và sau sử dụng.
CREATE TABLE "usage_handover" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "handed_over_by" UUID NOT NULL,
    "handed_over_at" TIMESTAMPTZ NOT NULL,
    "condition_note" TEXT,
    "handover_items" JSONB NOT NULL DEFAULT '[]',
    "returned_by" UUID,
    "returned_at" TIMESTAMPTZ,
    "return_note" TEXT,
    "return_items" JSONB,

    CONSTRAINT "usage_handover_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_handover_return_pair" CHECK (("returned_at" IS NULL) = ("returned_by" IS NULL)),
    CONSTRAINT "usage_handover_return_after" CHECK ("returned_at" IS NULL OR "returned_at" >= "handed_over_at")
);
CREATE UNIQUE INDEX "usage_handover_request_id_key" ON "usage_handover"("request_id");
ALTER TABLE "usage_handover" ADD CONSTRAINT "usage_handover_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "usage_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_handover" ADD CONSTRAINT "usage_handover_handed_over_by_fkey" FOREIGN KEY ("handed_over_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_handover" ADD CONSTRAINT "usage_handover_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
