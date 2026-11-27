-- BR-07: yêu cầu đến giờ bắt đầu mà chưa duyệt xong chuyển sang EXPIRED (API Contract mục 1.6).
ALTER TABLE "usage_request" DROP CONSTRAINT "usage_request_status_valid";
ALTER TABLE "usage_request" ADD CONSTRAINT "usage_request_status_valid" CHECK ("status" IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'));

-- Tác vụ hết hạn quét các yêu cầu PENDING theo giờ bắt đầu.
CREATE INDEX "usage_request_status_start_at_idx" ON "usage_request"("status", "start_at");
