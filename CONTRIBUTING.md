# Quy trình làm việc nhóm

Tài liệu này quy định cách đặt tên nhánh, viết commit, mở pull request (PR) và gộp mã vào `main`. Cả nhóm làm theo cùng một quy trình để lịch sử mã nguồn dễ đọc và nhánh `main` luôn chạy được.

## 1. Nguyên tắc chung

Nhánh `main` luôn ở trạng thái build và chạy được, không ai đẩy mã trực tiếp lên `main`. Mọi thay đổi đi qua một PR, phải có kết quả kiểm tra tự động đạt và được người phụ trách duyệt trước khi gộp. Không dùng nhánh cá nhân sống lâu như `hung`, `huy`, `khoa`. Mỗi công việc dùng một nhánh riêng, gộp xong thì xóa.

## 2. Đặt tên nhánh

Tên nhánh có dạng `loai/ma-pb-mo-ta-ngan`, viết thường, không dấu, nối các từ bằng dấu gạch ngang. Mã PB lấy từ Product Backlog (ví dụ `pb-03` cho Quản lý phòng). Việc không gắn với một PB thì bỏ phần mã.

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| feat | Thêm chức năng | feat/pb-03-quan-ly-phong |
| fix | Sửa lỗi | fix/pb-01-het-han-token |
| docs | Chỉ sửa tài liệu | docs/cap-nhat-erd |
| test | Thêm hoặc sửa kiểm thử | test/pb-08-trung-lich |
| refactor | Tổ chức lại mã, không đổi hành vi | refactor/tach-module-auth |
| chore | Cấu hình, thư viện, CI | chore/nang-cap-prisma |

Không đặt tên nhánh trùng đầu với một nhánh khác theo kiểu `hung` và `hung/abc`, vì Git không cho tạo thư mục tên đó khi đã có nhánh cùng tên.

## 3. Quy ước commit

Thông điệp commit viết tiếng Việt theo dạng `loai(pham-vi): mô tả ngắn`, với `loai` lấy từ bảng ở mục 2 và `pham-vi` là `api`, `web`, `db`, `ci`, `auth`... Mô tả viết ở thì hiện tại, không kết thúc bằng dấu chấm, tối đa khoảng 72 ký tự. Phần thân commit (nếu cần) giải thích lý do thay đổi.

Mỗi commit nên là một thay đổi trọn vẹn, ví dụ migration và model đi cùng nhau, kiểm thử đi cùng chức năng. Không đưa mật khẩu, khóa bí mật hay tệp `.env` vào commit.

Commit và mô tả PR chỉ ghi tên các thành viên nhóm. Không thêm dòng `Co-Authored-By`, dòng "Generated with", hay bất kỳ ghi công nào cho công cụ hỗ trợ.

## 4. Mở pull request

Tạo nhánh từ `main` mới nhất, làm việc, rồi đẩy lên và mở PR vào `main`.

```
git switch main
git pull
git switch -c feat/pb-03-quan-ly-phong
```

Tiêu đề PR theo cùng dạng với commit, ví dụ `feat: quản lý phòng (PB-03)`. Phần mô tả điền theo mẫu có sẵn trong `.github/pull_request_template.md`, gồm mục tiêu, thay đổi chính, cách kiểm tra, ảnh chụp màn hình khi đổi giao diện, và ghi chú cho người review. Ghi mã công việc Jira liên quan, ví dụ SCRUM-8.

PR nên nhỏ, đủ để người khác đọc xong trong khoảng 30 phút. Chức năng lớn thì tách thành nhiều PR theo lớp (cơ sở dữ liệu, API, giao diện).

## 5. Review và gộp

Sau khi mở PR, hệ thống tự chạy hai kiểm tra: kiểm thử backend và build frontend. PR chỉ được gộp khi cả hai đạt. Người review đọc theo các hướng sau: đúng yêu cầu trong Product Backlog, có kiểm thử cho nhánh xử lý mới, kiểm tra dữ liệu đầu vào và phân quyền ở phía máy chủ, migration không sửa lại migration đã gộp, và tài liệu (README, SRS, API Contract, ERD) được cập nhật nếu hành vi thay đổi.

Góp ý được xử lý bằng commit mới trên cùng nhánh, không mở PR khác. Khi mọi góp ý đã xong, người phụ trách gộp bằng **Squash and merge** để mỗi PR thành một commit trên `main`, tiêu đề commit lấy từ tiêu đề PR. Gộp xong thì xóa nhánh nguồn.

## 6. Môi trường và dữ liệu

Cách chạy dự án, tài khoản mẫu và chạy kiểm thử xem trong `README.md`. Thay đổi cơ sở dữ liệu đi bằng migration mới (`npm run db:migrate`), không sửa tay migration đã gộp. Mật khẩu tài khoản mẫu chỉ dùng cho phát triển và demo. Khi triển khai thật, phải đặt `JWT_SECRET` và `SEED_PASSWORD` riêng.
