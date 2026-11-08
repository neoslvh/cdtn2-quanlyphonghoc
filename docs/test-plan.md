# Test Plan rút gọn: Sprint 2, Hệ thống quản lý phòng học và thiết bị

## 1. Phạm vi kiểm thử và phần chủ ý không kiểm

Được kiểm (phạm vi Sprint 2):

- FR-01, FR-02: đăng nhập, đăng xuất, cấp tài khoản, phân quyền theo vai trò ở máy chủ và ở giao diện (NFR-04).
- FR-03: quản lý phòng, thêm, sửa, đổi trạng thái, không đổi mã phòng và cơ sở.
- FR-06 và BR-01, BR-08, BR-10: tra cứu phòng trống theo khung giờ, sức chứa, loại phòng, thiết bị.
- FR-07, FR-08, FR-09 và BR-02, BR-05, BR-09: lập, gửi, hủy yêu cầu sử dụng phòng, bảy bước kiểm tra khi gửi theo bảng 1.7 của API Contract.
- FR-10, FR-11, FR-14, FR-21: duyệt và từ chối theo chuỗi đơn vị, kiểm tra lại trước cấp cuối, thông báo và nhật ký thao tác.
- FR-23 và BR-10, BR-11, BR-12: nhập thời khóa biểu của Phòng Đào tạo, xem trước, xác nhận, hủy yêu cầu bị trùng, sửa và hủy buổi học.
- Tính toàn vẹn ở cơ sở dữ liệu: ràng buộc loại trừ chống hai lượt đặt chồng giờ, CHECK giá trị, truy cập đồng thời.

Chủ ý không kiểm, kèm lý do:

- Thiết bị đi kèm phiếu và cập nhật theo thời gian thực: thuộc Sprint 3 và 4.
- Hiệu năng dưới tải (NFR-03): chưa đo, chỉ có chỉ mục GiST cho truy vấn trùng lịch.
- Đăng nhập một lần bằng tài khoản trường: chưa tích hợp được.

## 2. Các tầng kiểm thử và cách chạy

| Tầng | Vị trí | Số ca | Dữ liệu | Cách chạy |
|---|---|---|---|---|
| Unit (service) | `backend/tests/unit` | 78 | Repository giả trong bộ nhớ, đồng hồ cố định | `cd backend && npm test` |
| API (HTTP) | `backend/tests/api` | 67 | Cơ sở dữ liệu giả, supertest, tệp tạo ngay trong test | `cd backend && npm test` |
| Tích hợp | `backend/tests/integration` | 19 | PostgreSQL thật đã migrate và seed | `RUN_PG_TESTS=1 DATABASE_URL=... npx jest tests/integration` |
| Giao diện (dữ liệu giả) | `frontend/src/mock` | 17 | Dữ liệu giả theo API Contract | `cd frontend && npm test` |
| Toàn hệ thống (E2E) | `e2e/tests` | 27 | Hệ thống dựng bằng Docker, dữ liệu seed | `cd e2e && npx playwright test` |
| Script Jira | `.github/scripts` | 10 | Gọi hàm thuần | `python3 -m unittest discover -s .github/scripts` |

CI chạy tự động các tầng unit, API, tích hợp (PostgreSQL dựng trong workflow), giao diện và script Jira cho mỗi pull request. Bộ E2E chạy tay vì cần dựng cả hệ thống.

## 3. Kỹ thuật chọn dữ liệu

- Phân vùng tương đương cho tệp thời khóa biểu: mỗi cột có một ca sai riêng (học kỳ khác, thứ ngoài 2 đến 8, tiết ngoài khung, mã phòng lạ, ngày không có thật, trải quá 370 ngày).
- Giá trị biên cho thời gian: kết thúc 21:30 được, 21:31 bị từ chối (BR-09); gửi đúng ba ngày làm việc trước được, thiếu một ngày bị từ chối (BR-02); hai khoảng chỉ chạm đầu mút (kết thúc 10:00, bắt đầu 10:00) không tính là trùng; sức chứa bằng và vượt một người.
- Bảng quyết định cho phân quyền: mỗi API được thử với bốn vai trò, riêng lịch học còn thử cán bộ duyệt không thuộc Phòng Đào tạo.
- Thứ tự kiểm tra: phiếu vừa sát giờ vừa vượt sức chứa phải báo `LEAD_TIME_VIOLATION` trước, đúng bảng 1.7.
- Truy cập đồng thời trên PostgreSQL thật: tám yêu cầu cùng thêm một mã phòng, năm yêu cầu cùng gửi một phiếu, năm yêu cầu cùng xác nhận một lần nhập; mỗi trường hợp đúng một yêu cầu thành công.

## 4. Tiêu chí thành công đo được

- Mọi quy tắc nghiệp vụ trong phạm vi ở mục 1 có ít nhất một test luồng đúng và một test luồng sai đạt.
- Mọi API có test phân quyền cho từng vai trò.
- `npm test` ở backend và frontend chạy một lệnh, toàn bộ đạt; 27/27 kịch bản E2E đạt trên hệ thống dựng từ cơ sở dữ liệu trống.
- Không còn bug nghiêm trọng đang mở; bug đã sửa có commit `fix` riêng và được ghi ở `docs/bug-log.md`.

## 5. Môi trường

- Backend: Node.js 24, Express 5, Prisma 6, PostgreSQL 18.
- Test E2E: Playwright dùng Chrome cài sẵn, múi giờ `Asia/Ho_Chi_Minh`, một worker vì các test dùng chung cơ sở dữ liệu.
- Tài khoản mẫu do seed tạo: `admin@qlphong.local`, `csvc@qlphong.local`, `daotao@qlphong.local`, `sv01@qlphong.local`, mật khẩu theo `SEED_PASSWORD` (mặc định `Demo@12345`, chỉ dùng phát triển và demo).
