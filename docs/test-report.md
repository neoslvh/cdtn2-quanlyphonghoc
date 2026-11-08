# Test Report: Sprint 2

Kết quả chạy ngày 07/11/2026 trên nhánh `staging` sau khi gộp PR #18. Cách chạy từng tầng xem `docs/test-plan.md`.

## 1. Tổng hợp theo tầng

| Tầng | Số ca | Đạt | Không đạt |
|---|---|---|---|
| Unit (service) | 78 | 78 | 0 |
| API (HTTP) | 82 | 82 | 0 |
| Tích hợp PostgreSQL thật | 28 | 28 | 0 |
| Giao diện (dữ liệu giả) | 17 | 17 | 0 |
| Toàn hệ thống (Playwright) | 27 | 27 | 0 |
| Script Jira | 10 | 10 | 0 |
| **Tổng** | **242** | **242** | **0** |

CI của pull request chạy các tầng unit, API, tích hợp, giao diện và script Jira; các PR của Sprint 2 chỉ được tự gộp khi CI đạt. Bộ Playwright chạy tay trên hệ thống dựng từ cơ sở dữ liệu trống bằng Docker, mất 39 giây.

## 2. Kết quả theo chức năng

| Chức năng | Quy tắc | Kết quả chính |
|---|---|---|
| Đăng nhập, phân quyền | FR-01, FR-02, NFR-04 | Mọi API được thử với bốn vai trò; người đăng ký gọi API quản lý phòng bị 403 dù biết đường dẫn; menu và trang bị chặn đúng theo vai trò ở giao diện |
| Quản lý phòng | FR-03 | Thêm, sửa, lọc, phân trang đạt; mã phòng và cơ sở không đổi khi sửa; tám yêu cầu cùng thêm một mã chỉ một thành công |
| Tra cứu phòng trống | FR-06, BR-01, BR-08, BR-10 | Loại phòng bận, đủ sức chứa, đủ thiết bị; buổi học PENDING không chặn phòng; khoảng chạm đầu mút không trùng |
| Gửi yêu cầu | FR-07, FR-08, BR-02, BR-05, BR-09 | Bảy bước kiểm tra đúng thứ tự bảng 1.7, biên 21:30 và ba ngày làm việc; năm yêu cầu cùng gửi một phiếu chỉ một thành công và chỉ có hai bước duyệt |
| Tệp đính kèm | FR-07 | Từ chối quá 5 MB, định dạng lạ, nội dung không đúng chữ ký, quá 5 tệp; tệp bị xóa khi lưu bản ghi lỗi |
| Duyệt phiếu | FR-10, FR-11, SCRUM-13 | Duyệt theo chuỗi đơn vị, đơn vị không đúng bước bị 403; lịch học hoặc lượt đặt xuất hiện sau khi gửi thì bước cuối bị chặn; hai phiếu cùng phòng cùng giờ duyệt đồng thời chỉ một phiếu thành công; năm yêu cầu cùng duyệt một bước chỉ một thành công |
| Thông báo, nhật ký | FR-14, FR-21 | Thông báo khi lịch học hủy phiếu, khi duyệt và từ chối; nhật ký có người thực hiện, giá trị trước và sau; chỉ ADMIN xem nhật ký |
| Lịch học chính khóa | FR-23, BR-11, BR-12 | Lỗi từng dòng và từng cột, bản xem trước, xác nhận hủy yêu cầu trùng cùng bước duyệt và lượt đặt trong một giao dịch; năm yêu cầu cùng xác nhận chỉ một thành công |
| Toàn vẹn dữ liệu | BR-01 | Ràng buộc loại trừ GiST chặn lượt đặt thứ hai chồng giờ, cho phép lượt liền kề; CHECK từ chối trạng thái sai |

## 3. Kịch bản E2E đã chạy (Playwright)

| Mã | Nội dung | Số ca |
|---|---|---|
| E2E-01 | Đăng nhập sai mật khẩu, đăng nhập đúng, đăng xuất, vào trang trong khi chưa đăng nhập | 3 |
| E2E-02 | Phân quyền menu và trang cho bốn vai trò, 403 ở máy chủ | 5 |
| E2E-03 | Tra cứu phòng trống, lọc loại phòng, xóa lọc | 3 |
| E2E-04 | Lập và gửi phiếu, gửi sát giờ, từ 200 người, vượt sức chứa, quyền vào trang | 5 |
| E2E-05 | Quản lý phòng: thêm, trùng mã, bảo trì, lọc | 4 |
| E2E-06 | Nhập thời khóa biểu: tệp mẫu, tệp lỗi, xem trước và xác nhận, phòng hết trống, phiếu bị chặn nêu tên lớp, hủy buổi, quyền | 7 |

## 4. Bug phát hiện và đã sửa

Xem `docs/bug-log.md`: ba bug, mỗi bug một commit sửa riêng. Ngoài ra test đua trên PostgreSQL thật phát hiện lỗi hết thời gian chờ giao dịch (P2028) khi năm yêu cầu cùng xác nhận một lần nhập; lỗi được sửa ngay trong PR #17 trước khi gộp, không có commit sửa riêng nên không ghi vào bug log.

## 5. Hạn chế đã biết

- Chuỗi đơn vị duyệt đang cố định trong mã đến khi có bảng quy tắc duyệt.
- Chưa đo hiệu năng (NFR-03). Tra cứu phòng trống hiện lọc thiết bị và cắt trang trong bộ nhớ.
- Sửa buổi học kiểm tra trùng rồi mới ghi ở hai bước, chưa nằm trong một giao dịch (Claude review đã ghi nhận).
- `npm audit` còn lỗ hổng mức cao của `body-parser` (qua Express) và `deepmerge-ts` (qua Prisma CLI), cần cập nhật phụ thuộc ở một PR riêng.
- Bộ Playwright chưa chạy trong CI.
