# API mã QR, check-in và báo hỏng

Tài liệu mô tả các API của FR-05 (SCRUM-10), FR-18 (SCRUM-23) và FR-19 (SCRUM-24). Đường dẫn đặt dưới `/api`, lỗi theo mẫu chung `{ error: { code, message, details } }` của API Contract mục 1.1. Dữ liệu lưu ở hai bảng `checkin` và `incident_report` theo ERD v4.1 (migration `20261129000000_checkin_bao_hong`); bảng `incident_report` có thêm cột `image_name` giữ tên gốc của ảnh để hiển thị.

## 1. Mã QR của phòng và thiết bị (SCRUM-10)

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | /rooms/{id}/qr | FACILITY_STAFF, ADMIN | Ảnh SVG mã QR của phòng, dán tại cửa phòng để check-in |
| GET | /equipment/{id}/qr | FACILITY_STAFF, ADMIN | Ảnh SVG mã QR của thiết bị |
| GET | /qr/{token} | Đã đăng nhập | `{ type: 'ROOM', room }` hoặc `{ type: 'EQUIPMENT', equipment }` |

Mỗi phòng và thiết bị có cột `qr_token` duy nhất. Mã QR chứa đường dẫn `{APP_URL}/qr/{token}`, nên quét bằng camera điện thoại là mở trang thông tin tài nguyên trên giao diện; chưa đăng nhập thì đăng nhập xong quay lại đúng trang đó. Dưới hình QR in mã phòng hoặc mã tài sản và token để nhập tay khi trình duyệt không quét được. `APP_URL` đặt trong biến môi trường; bỏ trống thì máy chủ lấy địa chỉ người dùng đang mở (có xét `X-Forwarded-Proto` khi chạy sau proxy HTTPS).

GET /qr/{token} trả trạng thái hiện tại của tài nguyên, kể cả khi phòng ngừng sử dụng hay thiết bị hỏng. Phòng gồm `{ id, code, name, roomType, capacity, status }`; thiết bị gồm `{ id, assetCode, name, equipmentType, status, qrToken, room: { id, code } | null }`. Token không tồn tại trả 404 `NOT_FOUND`.

GET /rooms/{id} trả thêm `room.equipmentItems` là danh sách thiết bị của phòng (cùng dạng thiết bị ở trên), dùng cho ô chọn thiết bị khi báo hỏng.

## 2. Check-in bằng QR (SCRUM-23)

POST /requests/{id}/checkin, quyền REQUESTER, nhận `{ qrToken }` và trả `{ request }`. `qrToken` nhận cả đường dẫn quét được từ mã QR lẫn token nhập tay.

| Tình huống | Kết quả |
|---|---|
| Thiếu mã | 400 `VALIDATION_ERROR`, `details[].field = 'qrToken'` |
| Phiếu không phải của người gọi | 404 `NOT_FOUND` |
| Phiếu chưa ở trạng thái APPROVED | 409 `INVALID_STATE` "Chỉ check-in được yêu cầu đã duyệt." |
| Mã QR không phải của phòng trong phiếu (kể cả mã thiết bị) | 409 `INVALID_STATE` "Mã QR không phải của phòng {mã phòng}." |
| Ngoài khung giờ từ 15 phút trước giờ bắt đầu đến giờ kết thúc | 409 `INVALID_STATE` "Chỉ check-in được từ {giờ} đến {giờ}." |
| Đã check-in | 409 `INVALID_STATE` "Yêu cầu này đã check-in." |

Mỗi phiếu chỉ có một dòng check-in nhờ ràng buộc unique `request_id`, nên hai lần bấm cùng lúc chỉ một lần thành công. Check-in ghi nhật ký `REQUEST_CHECKED_IN`. Đối tượng `request` có thêm `checkin` là `{ checkedInAt, result }` hoặc `null`.

## 3. Báo hỏng thiết bị (SCRUM-24)

POST /incidents, quyền REQUESTER, nhận multipart gồm `requestId`, `equipmentId`, `description` và `image` (tùy chọn), trả 201 `{ incident }`.

- Mô tả bắt buộc, tối đa 2.000 ký tự.
- Ảnh chỉ nhận PNG hoặc JPG, kiểm cả đuôi tệp lẫn chữ ký đầu tệp (sai trả 415 `UNSUPPORTED_FILE_TYPE`), tối đa 5 MB (vượt trả 413 `FILE_TOO_LARGE`).
- Phiếu phải là của người báo và đã duyệt (409 `INVALID_STATE` nếu chưa duyệt); thiết bị phải thuộc phòng của phiếu (400 `VALIDATION_ERROR` với `field = 'equipmentId'`).
- Tạo báo hỏng ở trạng thái `OPEN`, chuyển thiết bị sang `BROKEN` và ghi nhật ký `INCIDENT_REPORTED` trong cùng một giao dịch. Lưu cơ sở dữ liệu thất bại thì xóa ảnh đã lưu.

GET /incidents, quyền FACILITY_STAFF và ADMIN, nhận `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`), `page`, `pageSize`, trả `{ items, page, pageSize, total }`, mới nhất trước. Mỗi phần tử gồm `{ id, createdAt, description, imageName, status, reporterName, request: { id, code }, room: { code }, equipment: { id, assetCode, name }, ticket }`. `ticket` là `null` cho đến khi có phiếu bảo trì (SCRUM-25).
