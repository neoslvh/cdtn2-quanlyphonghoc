-- Các cột trạng thái và loại chỉ nhận giá trị hợp lệ, để giá trị gõ sai không làm hỏng logic tra cứu phòng và duyệt yêu cầu.
ALTER TABLE "user" ADD CONSTRAINT "user_role_valid" CHECK ("role" IN ('REQUESTER', 'APPROVER', 'FACILITY_STAFF', 'ADMIN'));
ALTER TABLE "user" ADD CONSTRAINT "user_status_valid" CHECK ("status" IN ('PENDING', 'ACTIVE', 'LOCKED'));
ALTER TABLE "organization" ADD CONSTRAINT "organization_type_valid" CHECK ("type" IN ('REQUESTER_UNIT', 'APPROVAL_UNIT', 'FACILITY_UNIT'));
ALTER TABLE "room" ADD CONSTRAINT "room_type_valid" CHECK ("room_type" IN ('CLASSROOM', 'LAB', 'HALL'));
ALTER TABLE "room" ADD CONSTRAINT "room_status_valid" CHECK ("status" IN ('AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'));
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_status_valid" CHECK ("status" IN ('GOOD', 'BROKEN', 'MAINTENANCE'));
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_mode_valid" CHECK ("mode" IN ('APPEND', 'REPLACE'));
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_status_valid" CHECK ("status" IN ('PREVIEW', 'COMMITTED', 'DISCARDED'));
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_status_valid" CHECK ("status" IN ('PENDING', 'ACTIVE', 'CANCELLED'));
ALTER TABLE "usage_request" ADD CONSTRAINT "usage_request_status_valid" CHECK ("status" IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));
ALTER TABLE "request_equipment" ADD CONSTRAINT "request_equipment_type_valid" CHECK ("item_type" IN ('MICROPHONE', 'PROJECTOR', 'AUDIO', 'AIR_CONDITIONER', 'OTHER'));
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_status_valid" CHECK ("status" IN ('PENDING', 'WAITING', 'APPROVED', 'REJECTED', 'CANCELLED'));
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_status_valid" CHECK ("status" IN ('ACTIVE', 'CANCELLED'));
