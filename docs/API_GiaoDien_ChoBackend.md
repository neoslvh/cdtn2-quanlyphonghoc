# API mà giao diện đang chờ backend

Tài liệu này liệt kê các API trong API Contract v1.0 mà giao diện đã làm xong nhưng máy chủ chưa có, kèm dạng dữ liệu giao diện đang dùng. Khi máy chủ trả 404 với thông điệp "Không tìm thấy API." (mặc định của `backend/src/app.js` cho đường dẫn chưa cài đặt), trang tương ứng hiện thông báo "chưa có API ở máy chủ" thay vì báo lỗi. Backend làm đúng đường dẫn và dạng dữ liệu dưới đây thì giao diện chạy được ngay, không phải sửa.

Dữ liệu giả cho các API này nằm ở `frontend/src/mock/facility.js`, có kiểm thử ở `frontend/src/mock/facility.test.js`. Chạy giao diện với `VITE_API_MOCK=true` để xem các trang này hoạt động khi backend chưa xong. Cột dữ liệu theo ERD v4.1, mã lỗi theo bảng 1.1 của API Contract.

## 1. Thiết bị (SCRUM-9)

| Phương thức | Đường dẫn | Giao diện gửi | Giao diện cần nhận |
|---|---|---|---|
| GET | /equipment | `roomId`, `equipmentType`, `status`, `q` (tìm mã tài sản hoặc tên), `page`, `pageSize` | `{ items, page, pageSize, total }`, mỗi phần tử `{ id, assetCode, name, equipmentType, status, qrToken, room: { id, code } \| null }` |
| POST | /equipment | `{ assetCode, name, equipmentType, status, roomId \| null }` | `{ equipment }`. Trùng mã tài sản trả 400 với `details[].field = 'assetCode'` |
| GET | /equipment/{id} | | `{ equipment }` |
| PATCH | /equipment/{id} | như POST | `{ equipment }` |

Mã QR của phòng, thiết bị và `room.equipmentItems` đã có ở máy chủ (SCRUM-10), xem `API_QR_CheckIn_BaoHong.md`. `equipmentType` nhận `PROJECTOR`, `MICROPHONE`, `AUDIO`, `AIR_CONDITIONER`, khớp `EQUIPMENT_TYPES` của backend. `status` nhận `GOOD`, `BROKEN`, `MAINTENANCE`.

## 2. Lịch đã duyệt của phòng (SCRUM-16)

GET /rooms/{id}/bookings nhận `from`, `to` (ISO 8601 có múi giờ) và trả `{ items }`, mỗi phần tử `{ requestId, requestCode, startAt, endAt, purpose, requesterName }`, xếp theo giờ bắt đầu. Giao diện mở từ nút Lịch ở trang Quản lý phòng và trang Tra cứu phòng, xem theo tuần.

## 3. Bàn giao, nhận trả (SCRUM-22)

| Phương thức | Đường dẫn | Giao diện gửi | Giao diện cần nhận |
|---|---|---|---|
| GET | /requests?status=APPROVED | `page`, `pageSize` | như hiện tại. Cần mở quyền cho FACILITY_STAFF (hiện chỉ REQUESTER và ADMIN), giao diện đang hiện thông báo khi nhận 403 |
| POST | /requests/{id}/handover | `{ conditionNote }` | `{ request }` |
| POST | /requests/{id}/return | `{ conditionNote }` | `{ request }` |

Đối tượng `request` trả về bổ sung `handover` là `{ handedOverAt, handedOverBy, conditionNote, returnedAt, returnNote }` hoặc `null`. Trang chi tiết yêu cầu đọc trường này để hiện mục Sử dụng phòng. Check-in (SCRUM-23) và trường `checkin` đã có ở máy chủ, xem `API_QR_CheckIn_BaoHong.md`.

## 4. Bảo trì (SCRUM-25)

| Phương thức | Đường dẫn | Giao diện gửi | Giao diện cần nhận |
|---|---|---|---|
| POST | /maintenance-tickets | `{ incidentId, note }` | `{ ticket }`. Thiết bị chuyển `MAINTENANCE`, báo hỏng chuyển `IN_PROGRESS` |
| PATCH | /maintenance-tickets/{id} | `{ status: 'DONE', note }` | `{ ticket }`. Thiết bị trở lại `GOOD`, báo hỏng chuyển `RESOLVED` |

Báo hỏng (POST /incidents, GET /incidents) đã có ở máy chủ (SCRUM-24), xem `API_QR_CheckIn_BaoHong.md`. Khi có phiếu bảo trì, GET /incidents điền `ticket: { id, status, note }` thay cho `null`.

## 5. Quy tắc duyệt (SCRUM-17, SCRUM-21)

GET /approval-rules trả `{ items }`, mỗi phần tử `{ id, code, name, priority, condition, targetOrg: { id, name }, active }`. POST /approval-rules và PATCH /approval-rules/{id} nhận `{ code, name, priority, targetOrgId, active, condition }` và trả `{ rule }`. PATCH chỉ có `{ active }` dùng cho nút bật tắt. Trường `condition` ứng với cột `condition_json`, gồm `timeFrom`, `timeTo` dạng HH:mm và `minParticipants`, cần ít nhất một điều kiện.

## 6. Báo cáo thống kê (SCRUM-27)

GET /reports/summary nhận `from`, `to` và trả `{ requests: { total, byStatus }, brokenEquipment, openIncidents, roomUsage }`. Trong đó `byStatus` đếm theo `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `EXPIRED`; `roomUsage` là danh sách `{ roomCode, roomName, bookings, hours }` của các lượt đã duyệt, xếp giảm dần theo số giờ.

## 7. Bổ sung cho các màn hình đã có API

Một số bộ lọc trong wireframe cần thêm tham số ở API đã có nên giao diện chưa làm. GET /requests cần `from`, `to` và `q` (mã yêu cầu hoặc mã phòng) cho bộ lọc của WF-04. GET /approvals cần `organizationId`, `roomType`, `campus` và quy mô cho bộ lọc của WF-06. Các bước duyệt trong đối tượng `request` đã có `decidedAt` và `decisionReason` (SCRUM-32) nên WF-05 hiện được thời điểm và ghi chú của từng cấp.
