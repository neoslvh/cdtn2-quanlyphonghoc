# API mã QR, check-in, báo hỏng và bàn giao

Tài liệu mô tả các API của FR-05 (SCRUM-10), FR-18 (SCRUM-23), FR-19 (SCRUM-24) và FR-17 (SCRUM-22). Đường dẫn đặt dưới `/api`, lỗi theo mẫu chung `{ error: { code, message, details } }` của API Contract mục 1.1. Dữ liệu lưu ở hai bảng `checkin` và `incident_report` theo ERD v4.1 (migration `20261129000000_checkin_bao_hong`); bảng `incident_report` có thêm cột `image_name` giữ tên gốc của ảnh để hiển thị.

## 1. Mã QR của phòng và thiết bị (SCRUM-10)

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | /rooms/{id}/qr | FACILITY_STAFF, ADMIN | Ảnh SVG mã QR của phòng, dán tại cửa phòng để check-in |
| GET | /equipment/{id}/qr | FACILITY_STAFF, ADMIN | Ảnh SVG mã QR của thiết bị |
| GET | /qr/{token} | Đã đăng nhập | `{ type: 'ROOM', room }` hoặc `{ type: 'EQUIPMENT', equipment }` |

Mỗi phòng và thiết bị có cột `qr_token` duy nhất. Mã QR chứa đường dẫn `{APP_URL}/qr/{token}`, nên quét bằng camera điện thoại là mở trang thông tin tài nguyên trên giao diện; chưa đăng nhập thì đăng nhập xong quay lại đúng trang đó. Dưới hình QR in mã phòng hoặc mã tài sản và token để nhập tay khi trình duyệt không quét được. Địa chỉ lấy từ biến môi trường `APP_URL`, không có thì dùng `RENDER_EXTERNAL_URL` do Render tự cấp. Mã QR được in và dán cố định nên khi `NODE_ENV=production` máy chủ không lấy địa chỉ từ header `Host` do client gửi (giả được để trỏ sang trang lạ); thiếu cả hai biến thì trả 500 `CONFIG_ERROR`. Chỉ khi chạy thử mới dùng địa chỉ người dùng đang mở (có xét `X-Forwarded-Proto`).

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
- Chỉ báo hỏng trong thời gian dùng phòng, cùng khung giờ với check-in (409 `INVALID_STATE` "Chỉ báo hỏng được trong thời gian sử dụng phòng, từ {giờ} đến {giờ}.").
- Chỉ thiết bị đang `GOOD`: thiết bị đã báo hỏng hoặc đang bảo trì trả 409 `INVALID_STATE`, không tạo báo hỏng trùng và không đổi sai trạng thái bảo trì.
- Tạo báo hỏng ở trạng thái `OPEN`, chuyển thiết bị sang `BROKEN` và ghi nhật ký `INCIDENT_REPORTED` trong cùng một giao dịch. Thiết bị chỉ được đổi khi còn `GOOD` (cập nhật có điều kiện), nên hai người báo cùng lúc thì một người nhận 409. Bị từ chối hoặc lưu cơ sở dữ liệu thất bại thì xóa ảnh đã lưu.

GET /incidents, quyền FACILITY_STAFF và ADMIN, nhận `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`), `page`, `pageSize`, trả `{ items, page, pageSize, total }`, mới nhất trước. Mỗi phần tử gồm `{ id, createdAt, description, imageName, status, reporterName, request: { id, code }, room: { code }, equipment: { id, assetCode, name }, ticket }`. `ticket` là `null` cho đến khi có phiếu bảo trì (SCRUM-25).

## 4. Bàn giao và nhận trả phòng (SCRUM-22)

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | /requests?status=APPROVED | REQUESTER, FACILITY_STAFF, ADMIN | Nhân viên cơ sở vật chất và quản trị viên thấy mọi phiếu; người đăng ký chỉ thấy phiếu của mình |
| POST | /requests/{id}/handover | FACILITY_STAFF, ADMIN | Nhận `{ conditionNote }` (tùy chọn, tối đa 1.000 ký tự), trả `{ request }` |
| POST | /requests/{id}/return | FACILITY_STAFF, ADMIN | Nhận `{ conditionNote }` là tình trạng sau sử dụng, trả `{ request }` |

Bàn giao chỉ cho phiếu `APPROVED`, chưa bàn giao và chưa quá giờ kết thúc; nhận trả chỉ khi đã bàn giao và chưa nhận trả. Sai điều kiện trả 409 `INVALID_STATE` với các thông báo "Chỉ bàn giao yêu cầu đã duyệt.", "Yêu cầu này đã được bàn giao.", "Đã quá giờ kết thúc sử dụng nên không bàn giao được.", "Yêu cầu chưa được bàn giao.", "Yêu cầu này đã nhận trả.". Ghi chú quá dài trả 400 với `field = 'conditionNote'`.

Dữ liệu lưu ở bảng `usage_handover` theo ERD v4.1 (migration `20261129010000_ban_giao`), thêm `return_note` và hai cột JSONB `handover_items`, `return_items` là danh sách thiết bị của phòng kèm tình trạng tại thời điểm bàn giao và nhận trả. Mỗi phiếu một biên bản nhờ unique `request_id`; nhận trả là cập nhật có điều kiện `returned_at IS NULL`, nên hai lần bấm cùng lúc chỉ một lần thành công. CHECK bảo đảm người và thời điểm nhận trả đi cùng nhau, thời điểm nhận trả không trước thời điểm bàn giao. Nhật ký ghi `REQUEST_HANDED_OVER` và `REQUEST_RETURNED`.

Đối tượng `request` có thêm `handover` là `null` hoặc `{ handedOverAt, handedOverBy, conditionNote, items, returnedAt, returnedBy, returnNote, returnItems }`, trong đó `handedOverBy`, `returnedBy` là họ tên, `items`, `returnItems` là danh sách `{ assetCode, name, equipmentType, status }`. Trang chi tiết phiếu hiện lại biên bản ở mục Sử dụng phòng.
