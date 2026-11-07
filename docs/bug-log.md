# Bug Log: Sprint 2

Mỗi bug có một commit `fix` riêng. Mức độ: Critical làm hỏng dữ liệu hoặc bảo mật, Major làm chức năng chính không dùng được, Minor chỉ ảnh hưởng thông báo hoặc trải nghiệm.

| Mã | Mức | Phát hiện bởi | Commit sửa | Trạng thái |
|---|---|---|---|---|
| BUG-001 | Major | Claude review PR #14 | `9e1957b` | Đã sửa |
| BUG-002 | Major | Claude review PR #15 (chặn gộp) | `7509782` | Đã sửa |
| BUG-003 | Major | Chạy thử toàn hệ thống qua nginx | `769f684` | Đã sửa |

## BUG-001: lỗi trùng khóa khi tạo tòa nhà bị báo nhầm là mã phòng trùng

- Hiện tượng: hai yêu cầu thêm phòng cùng lúc, tòa nhà chưa tồn tại. Cả hai cùng qua bước kiểm tra "tòa chưa có", yêu cầu thứ hai vướng ràng buộc unique của bảng `building` (P2002) và nhận thông báo "Mã phòng đã tồn tại" dù mã phòng chưa trùng.
- Nguyên nhân: một khối `try/catch` bao cả việc tạo tòa lẫn tạo phòng, nên mọi lỗi P2002 đều bị đổi thành lỗi mã phòng trùng.
- Cách sửa: bắt P2002 riêng quanh `createBuilding`, đọc lại tòa của yêu cầu thắng rồi đi tiếp; chỉ P2002 của `createRoom` mới báo mã phòng trùng.
- Kiểm thử: test unit "hai yêu cầu cùng tạo tòa mới" trong `tests/unit/roomService.test.js`.

## BUG-002: tham số `campus` không kiểm tra kiểu, có thể gây lỗi 500

- Hiện tượng (nhận định của Claude review, chưa tái hiện trước khi sửa): `GET /api/rooms/available?campus=a&campus=b` làm `campus` thành mảng và được đưa thẳng vào bộ lọc Prisma, Prisma ném lỗi nên API trả 500 thay vì `VALIDATION_ERROR`.
- Nguyên nhân: validator chỉ kiểm tra `roomType`, bỏ sót `campus`. Ngoài ra `from` và `to` nhận cả chuỗi không có múi giờ nên bị hiểu theo giờ máy chủ (UTC), sai 7 tiếng.
- Cách sửa: chỉ nhận `campus` là chuỗi tối đa 120 ký tự; `from` và `to` bắt buộc ISO 8601 có múi giờ.
- Kiểm thử: test API "campus gửi hai lần", test unit cho `campus` dạng mảng và object, giờ không múi giờ.

## BUG-003: nginx chặn tệp đính kèm lớn hơn 1 MB

- Hiện tượng (suy ra từ cấu hình, chưa tái hiện bằng tệp thật): tệp đính kèm hoặc thời khóa biểu lớn hơn 1 MB gửi qua giao diện sẽ bị nginx trả 413, dù API cho phép tới 5 MB.
- Nguyên nhân: nginx mặc định `client_max_body_size` là 1 MB; các test API gọi thẳng Express nên không thấy.
- Cách sửa: đặt `client_max_body_size 6m` cho `/api/`.
- Phát hiện khi rà cấu hình nginx lúc nối giao diện vào API thật, và sửa trước khi có người dùng gặp.
