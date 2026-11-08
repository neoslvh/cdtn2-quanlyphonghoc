# API duyệt phiếu, thông báo và nhật ký thao tác

Tài liệu này bổ sung cho SRS (FR-10, FR-11, FR-14, FR-21), API Contract mục 1.4 và ERD v4.1, ghi lại phần đã cài đặt ở Sprint 2. Mọi đường dẫn nằm dưới `/api`. Lỗi trả về theo mẫu `{ "error": { "code", "message", "details" } }`.

## 1. Các endpoint

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | /approvals | APPROVER | Phiếu PENDING có bước đang chờ đơn vị của người gọi, cũ nhất trước. Phân trang bằng `page`, `pageSize`. |
| POST | /requests/:id/approve | APPROVER của đơn vị ở bước hiện tại | Đồng ý bước hiện tại, `reason` tùy chọn. Bước cuối tạo `room_booking` ACTIVE và chuyển phiếu sang APPROVED. |
| POST | /requests/:id/reject | APPROVER của đơn vị ở bước hiện tại | Từ chối, bắt buộc `reason`. Phiếu sang REJECTED, các bước sau bị hủy. |
| GET | /notifications | Đã đăng nhập | Thông báo của chính người gọi, mới nhất trước. Tham số `unread=true` chỉ lấy thông báo chưa đọc. Trả thêm `unread` là tổng số chưa đọc. |
| PATCH | /notifications/:id/read | Đã đăng nhập | Đánh dấu một thông báo của mình là đã đọc. Thông báo của người khác trả 404. |
| POST | /notifications/read-all | Đã đăng nhập | Đánh dấu mọi thông báo của mình là đã đọc, trả `updated`. |
| GET | /audit-logs | ADMIN | Nhật ký thao tác, lọc theo `entityType`, `entityId`, `userId`, `action`. Phân trang bằng `page`, `pageSize`. |

## 2. Quy tắc duyệt

- Chuỗi duyệt sinh khi gửi phiếu: Phòng Đào tạo, thêm Ban Giám hiệu khi từ 200 người, cuối cùng Phòng Quản trị cơ sở vật chất. Tại mỗi thời điểm chỉ một bước ở trạng thái PENDING, các bước sau là WAITING.
- Chỉ APPROVER thuộc đơn vị của bước PENDING được quyết định; đơn vị khác trả 403 `FORBIDDEN`. Phiếu không còn PENDING hoặc đã bị xử lý bởi người khác trả 409 `INVALID_STATE`.
- Trước khi cấp cuối đồng ý, hệ thống kiểm tra lại trạng thái phòng, lịch học chính khóa và lượt đặt đã duyệt. Phòng không còn AVAILABLE trả 409 `ROOM_UNAVAILABLE`, trùng lịch trả 409 `ROOM_CONFLICT` kèm nguồn trùng, và phiếu giữ nguyên ở bước cuối.
- Ràng buộc loại trừ `room_booking_no_overlap` là chốt chặn cuối: nếu hai phiếu cùng phòng, cùng giờ được duyệt đồng thời thì đúng một phiếu thành công, phiếu còn lại trả `ROOM_CONFLICT`.
- Mỗi quyết định là một giao dịch gồm phiếu, bước duyệt, lượt đặt, thông báo cho người đăng ký và nhật ký.

## 3. Bảng mới

`audit_log`: `id`, `user_id` (có thể rỗng, khóa ngoại tới `user` với ON DELETE SET NULL), `action`, `entity_type`, `entity_id` (tham chiếu logic, không có khóa ngoại), `before_data`, `after_data` (JSONB), `created_at`. Chỉ mục theo (`entity_type`, `entity_id`), `created_at`, (`user_id`, `created_at`) và (`action`, `created_at`).

`notification`: `id`, `user_id`, `request_id` (có thể rỗng, ON DELETE SET NULL), `title`, `message`, `read_at`, `created_at`. Chỉ mục theo (`user_id`, `read_at`).

Các giá trị `action` đang dùng: REQUEST_CREATED, REQUEST_UPDATED, REQUEST_SUBMITTED, REQUEST_CANCELLED, REQUEST_STEP_APPROVED, REQUEST_APPROVED, REQUEST_REJECTED, REQUEST_CANCELLED_BY_SCHEDULE, ROOM_CREATED, ROOM_UPDATED, SCHEDULE_IMPORT_PREVIEWED, SCHEDULE_IMPORT_COMMITTED, SCHEDULE_IMPORT_DISCARDED, CLASS_SESSION_UPDATED, CLASS_SESSION_CANCELLED.
