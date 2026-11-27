# Test Report: Sprint 5

Kết quả chạy ngày 27/11/2026 trên nhánh `Khoa` sau khi gộp `staging` (PR #38), chạy lại ngày 28/11/2026 sau khi sửa ba lỗi SCRUM-31, SCRUM-32, SCRUM-33 và làm xong SCRUM-10, SCRUM-23, SCRUM-24, trên máy phát triển với PostgreSQL 18 chạy bằng Docker. Kết quả theo từng test case nằm trong tệp `TestCase_QuanLyPhongHoc_ThietBi_v2.xlsx`, bản cập nhật từ bộ test case của nhóm.

## 1. Tổng hợp theo tầng

| Tầng | Số ca | Đạt | Không đạt | Bỏ qua |
|---|---|---|---|---|
| Backend: unit, API, tích hợp PostgreSQL thật | 221 | 221 | 0 | 0 |
| Giao diện, dữ liệu giả (Vitest) | 53 | 53 | 0 | 0 |
| Toàn hệ thống trên Chrome (Playwright) | 76 | 71 | 0 | 5 |
| Toàn hệ thống trên dữ liệu giả (Playwright, `E2E_MOCK=1`) | 4 | 4 | 0 | 0 |
| Lặp lại trên Microsoft Edge (Playwright, `E2E_CHANNEL=msedge`) | 40 | 40 | 0 | 0 |

Năm ca Playwright bỏ qua gồm bốn ca chỉ chạy khi giao diện dùng dữ liệu giả và ca TC-FR12-02 đang để `fixme` vì backend chưa có quy tắc duyệt sau 18:00.

## 2. Tổng hợp theo test case

Bộ test case gốc có 73 ca. Bốn ca viết cho trang chủ kiểu cũ (TC-API-01, TC-UI-01, TC-INT-01, TC-UI-02) được viết lại theo giao diện hiện tại. Bổ sung 32 ca cho các phần chưa có test case: đăng nhập và đổi mật khẩu, cấp và tìm tài khoản, tệp đính kèm, giới hạn 21:30, sức chứa, kiểm tra lại ở bước cuối, thông báo, nhật ký, trang 404, trang chờ API và toàn bộ FR-23 lịch học chính khóa.

| Trạng thái | Số ca |
|---|---|
| Pass | 95 |
| Fail | 1 |
| Blocked | 13 |
| Chưa chạy | 1 |
| Tổng | 110 |

Ca Fail còn lại là TC-FR12-02: phiếu sau 18:00 vẫn đi Phòng Đào tạo thay vì Trung tâm Hỗ trợ Sinh viên vì chuỗi duyệt còn cố định trong mã (SCRUM-17). Mười ba ca Blocked thuộc các chức năng đã có giao diện nhưng máy chủ chưa có API: thiết bị (SCRUM-9), lịch phòng (SCRUM-16), quy tắc duyệt (SCRUM-21), bàn giao (SCRUM-22), bảo trì (SCRUM-25), báo cáo (SCRUM-27). Sáu ca của mã QR, check-in và báo hỏng (TC-FR05-01, TC-FR05-02, TC-FR18-01, TC-FR18-02, TC-FR19-01, TC-FR19-02) chuyển sang Pass sau khi có API ở mục 6. Giao diện của các chức năng này đã đạt khi chạy trên dữ liệu giả. Ca Chưa chạy là TC-NFR05-01, cần năm người ngoài nhóm thử trực tiếp.

## 3. Đo hiệu năng

Với 1.000 lượt đặt ACTIVE trên một phòng, mười lần tra cứu phòng trống mất 5 đến 24 ms và mười lần gửi phiếu trùng trả ROOM_CONFLICT mất 9 đến 58 ms, đạt NFR-02 (không quá 1 giây). Trang tra cứu phòng trống tải trong 685 ms và trả kết quả trong 285 ms, đạt NFR-03 (không quá 3 giây). Dữ liệu đo được xóa sau khi chạy.

## 4. Lỗi phát hiện khi kiểm thử

Đóng hộp mã QR làm sập trang vì phần ảnh vẫn đọc đối tượng đã bỏ; đã sửa và có ca E2E-13 giữ. Thanh trên và thanh phân trang của trang Thông báo tràn ngang ở chiều rộng 375px; đã sửa và có ca TC-NFR06-02 kiểm mười ba trang chính. Nút in phiếu hiện cả khi phiếu chưa duyệt, trái với FR-15; đã đổi thành chỉ hiện khi phiếu đã duyệt. Hai ca E2E cũ hỏng do dữ liệu tích lũy giữa các lần chạy và do form tự điền thiết bị từ PR #37; đã cho E2E-06 dọn dữ liệu thử và cập nhật E2E-04.

## 5. Kiểm thử luồng toàn diện

Sau khi chạy đủ bộ tự động, nhóm thử thêm các tình huống ngoài luồng chính: thao tác lại sau khi lỗi, phiên hết hạn giữa chừng, dữ liệu đã qua giờ, nhập thời khóa biểu nhiều lần. Phát hiện ba lỗi giao diện và ba lỗi backend, cả sáu lỗi đã sửa.

Lỗi giao diện đã sửa: tải tệp đính kèm lỗi rồi bấm lưu lại tạo phiếu nháp trùng (TC-FR07-09); phiên hết hạn hoặc bị thu hồi giữa chừng thì giao diện vẫn giữ người dùng trong hệ thống và trang nào cũng báo lỗi (TC-FR01-08); đăng nhập xong luôn về Trang chủ thay vì trang đang mở dở.

Lỗi backend: phiếu quá giờ bắt đầu mà chưa duyệt vẫn ở trạng thái chờ và vẫn duyệt được, chưa có quy tắc hết hạn BR-07 (TC-FR12-04, SCRUM-31); chi tiết phiếu không trả lý do từ chối cho người đăng ký (TC-FR13-06, SCRUM-32); nhập lớp mới trùng phòng, trùng giờ với lớp đã có từ lần nhập trước vẫn được kích hoạt (TC-FR23-08, SCRUM-33). Sửa buổi học vào giờ đã có lượt đặt được duyệt thì bị chặn đúng.

Cách sửa ba lỗi backend. SCRUM-31: thêm trạng thái EXPIRED; máy chủ chạy tác vụ mỗi phút chuyển phiếu PENDING đã tới giờ bắt đầu sang EXPIRED, hủy các bước còn chờ, gửi thông báo cho người đăng ký và ghi nhật ký REQUEST_EXPIRED; duyệt hoặc từ chối phiếu đã tới giờ trả 409 INVALID_STATE kể cả khi tác vụ chưa kịp chạy, và phiếu đó không còn trong hàng chờ duyệt. SCRUM-32: mỗi bước duyệt trong chi tiết phiếu trả thêm `decisionReason` và `decidedAt`, giao diện hiện thời điểm và lý do dưới tên đơn vị. SCRUM-33: bước kiểm tra tệp báo lỗi theo dòng khi lớp mới trùng phòng, trùng giờ với lớp đang có hiệu lực (trừ lớp sẽ bị thay ở chế độ thay thế cùng học kỳ); lúc xác nhận kiểm tra lại trong giao dịch, nếu trùng thì trả 409 ROOM_CONFLICT và bản nhập vẫn ở trạng thái xem trước. Các tình huống trên có test API trên dữ liệu giả và test tích hợp trên PostgreSQL thật.

## 6. Mã QR, check-in và báo hỏng

Ba thẻ SCRUM-10, SCRUM-23, SCRUM-24 có API theo `API_QR_CheckIn_BaoHong.md`. Ảnh QR sinh ra được giải mã thử bằng thư viện zbar, ra đúng đường dẫn `/qr/{token}` của giao diện. Ca check-in thành công (TC-FR18-01) chạy trên giao diện thật sau khi dời giờ của phiếu đã duyệt về hiện tại trong cơ sở dữ liệu kiểm thử, vì phiếu thật phải gửi trước ba ngày làm việc. Bộ E2E-15 kiểm mã QR phòng, trang mở từ mã QR, check-in sai phòng và sai giờ, báo hỏng kèm ảnh và danh sách báo hỏng của nhân viên cơ sở vật chất.

Khi kiểm thử phát hiện thêm hai lỗi cấu hình triển khai bằng docker và đã sửa: nginx chuyển tiếp `Host` không kèm cổng nên mã QR trỏ sai địa chỉ khi chạy ở cổng 8080, và CSP không cho ảnh `blob:` nên hộp mã QR không hiện ảnh.

## 7. Phần chưa tự động hóa được

Quét mã QR bằng camera điện thoại, in phiếu ra giấy, thử với người dùng thật (NFR-05), xem bằng mắt trên điện thoại thật, triển khai Render và đồng bộ Jira tự động (repo chưa có secrets) vẫn phải kiểm tay. Bộ Playwright chưa chạy trong CI của pull request.

## 8. Cách chạy lại

Dựng backend và giao diện như `docs/test-plan.md`, rồi chạy `npx playwright test` trong thư mục `e2e` với `E2E_BASE_URL` trỏ tới giao diện. Đặt `E2E_CHANNEL=msedge` để chạy trên Edge. Để chạy bốn ca trên dữ liệu giả, dựng thêm một bản giao diện với `VITE_API_MOCK=true` và chạy `E2E_MOCK=1 npx playwright test tests/10-giao-dien-du-lieu-gia.spec.ts`.
