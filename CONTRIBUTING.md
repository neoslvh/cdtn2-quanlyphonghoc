# Quy trình làm việc nhóm

Tài liệu này quy định cách đặt tên nhánh, viết commit, mở pull request (PR) và gộp mã vào `staging`, rồi đưa lên `main`. Cả nhóm làm theo cùng một quy trình để lịch sử mã nguồn dễ đọc và hai nhánh chính luôn chạy được.

## 1. Nguyên tắc chung

Kho có hai nhánh dài hạn. Nhánh `staging` là nơi tích hợp: mọi công việc của thành viên được gộp vào đây qua PR để cả nhóm chạy thử chung. Nhánh `main` là bản đã được duyệt, chỉ người phụ trách (trưởng nhóm hoặc người được giao) đưa mã từ `staging` lên khi thấy ổn, thành viên không mở PR hay đẩy trực tiếp vào `main`. Cả hai nhánh luôn ở trạng thái build và chạy được.

Mọi thay đổi đi qua một PR, phải có kết quả kiểm tra tự động đạt và được người phụ trách duyệt trước khi gộp. Không dùng nhánh cá nhân sống lâu như `hung`, `huy`, `khoa`. Mỗi gói việc dùng một nhánh riêng tạo từ `staging`, gộp xong thì xóa.

## 2. Đặt tên nhánh

Mỗi nhánh ứng với một gói việc, không phải một PB. Gói việc là nhóm các PB liên quan do cùng một người làm trong cùng một đợt, ví dụ Quản lý phòng, thiết bị và loại phòng (PB-03, PB-04, PB-05) là một gói. Mỗi người chỉ giữ tối đa một nhánh đang làm tại một thời điểm, gộp vào `staging` xong mới tạo nhánh tiếp theo. Cách này giữ số nhánh ít và số PB cần review vừa phải, trong khi lịch sử vẫn đọc được vì mỗi commit và mỗi dòng trong mô tả PR ghi rõ mã PB.

Tên nhánh có dạng `loai/ten-goi-viec`, viết thường, không dấu, nối các từ bằng dấu gạch ngang. Mã PB đi vào tiêu đề commit và mô tả PR chứ không đặt trong tên nhánh. Sửa nhỏ hoặc sửa tài liệu cùng phạm vi thì làm tiếp trên nhánh đang có, không mở nhánh mới.

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| feat | Thêm chức năng | feat/danh-muc-phong-thiet-bi |
| fix | Sửa lỗi | fix/dang-nhap-het-han-token |
| docs | Chỉ sửa tài liệu | docs/cap-nhat-erd |
| test | Thêm hoặc sửa kiểm thử | test/kiem-tra-trung-lich |
| refactor | Tổ chức lại mã, không đổi hành vi | refactor/tach-module-auth |
| chore | Cấu hình, thư viện, CI | chore/nang-cap-prisma |

Không đặt tên nhánh trùng đầu với một nhánh khác theo kiểu `feat` và `feat/abc`, vì Git không cho tạo thư mục tên đó khi đã có nhánh cùng tên.

## 3. Quy ước commit

Thông điệp commit viết tiếng Việt theo dạng `loai(pham-vi): mô tả ngắn`, với `loai` lấy từ bảng ở mục 2 và `pham-vi` là `api`, `web`, `db`, `ci`, `auth`... Mô tả viết ở thì hiện tại, không kết thúc bằng dấu chấm, tối đa khoảng 72 ký tự. Phần thân commit (nếu cần) giải thích lý do thay đổi.

Mỗi commit nên là một thay đổi trọn vẹn, ví dụ migration và model đi cùng nhau, kiểm thử đi cùng chức năng. Không đưa mật khẩu, khóa bí mật hay tệp `.env` vào commit.

Commit và mô tả PR chỉ ghi tên các thành viên nhóm. Không thêm dòng `Co-Authored-By`, dòng "Generated with", hay bất kỳ ghi công nào cho công cụ hỗ trợ.

## 4. Mở pull request

Tạo nhánh từ `staging` mới nhất, làm việc, rồi đẩy lên và mở PR vào `staging`.

```
git switch staging
git pull
git switch -c feat/pb-03-quan-ly-phong
```

Tiêu đề PR theo cùng dạng với commit, ví dụ `feat: quản lý phòng, thiết bị, loại phòng (PB-03, PB-04, PB-05)`. Phần mô tả điền theo mẫu có sẵn trong `.github/pull_request_template.md`, gồm mục tiêu, thay đổi chính, cách kiểm tra, ảnh chụp màn hình khi đổi giao diện, và ghi chú cho người review. Ghi mã công việc Jira liên quan, ví dụ SCRUM-8.

PR vừa đủ để người khác đọc xong trong khoảng 30 phút. Gói việc lớn thì mở PR theo từng mốc nhỏ trên cùng nhánh rồi tiếp tục làm, hoặc tách theo lớp (cơ sở dữ liệu, API, giao diện), mỗi PR vào `staging` ít nhất sau mỗi vài ngày để nhánh không sống quá lâu.

## 5. Review và gộp

Sau khi mở PR, hệ thống tự chạy hai kiểm tra: kiểm thử backend và build frontend. PR chỉ được gộp khi cả hai đạt. Người review đọc theo các hướng sau: đúng yêu cầu trong Product Backlog, có kiểm thử cho nhánh xử lý mới, kiểm tra dữ liệu đầu vào và phân quyền ở phía máy chủ, migration không sửa lại migration đã gộp, và tài liệu (README, SRS, API Contract, ERD) được cập nhật nếu hành vi thay đổi.

Góp ý được xử lý bằng commit mới trên cùng nhánh, không mở PR khác. Khi mọi góp ý đã xong, người phụ trách gộp bằng **Squash and merge** để mỗi PR thành một commit trên `staging`, tiêu đề commit lấy từ tiêu đề PR. Gộp xong thì xóa nhánh nguồn.

### 5.1. Claude review tự động

Mỗi PR vào `staging` được Claude review tự động (workflow `.github/workflows/claude-review.yml`). Claude đọc diff theo `CLAUDE.md` và `CONTRIBUTING.md`, rồi để lại một bình luận trên PR. Nếu không có điểm nào chặn gộp và CI đạt, PR tự được gộp vào `staging` bằng Squash. Nếu có điểm cần sửa, PR dừng lại, bình luận nêu tệp và dòng, vấn đề, lý do và cách sửa. Thành viên sửa rồi đẩy commit mới lên cùng nhánh, Claude review lại và cập nhật chính bình luận đó.

Điểm chặn gộp gồm lỗi logic, lỗ hổng bảo mật, sửa migration đã có, thiếu kiểm thử cho nhánh xử lý mới, làm hỏng build, và commit ghi công Claude hay Anthropic làm đồng tác giả. Các góp ý còn lại chỉ là gợi ý, không chặn gộp. Gắn nhãn `no-auto-merge` lên PR khi muốn Claude chỉ review mà không tự gộp. Claude không bao giờ gộp vào `main`, bước đó luôn do người phụ trách làm.

Chủ kho cần thêm secret `ANTHROPIC_API_KEY` ở Settings, Secrets and variables, Actions. Chưa có secret thì workflow tự bỏ qua và PR vẫn review thủ công như bình thường.

## 6. Đưa mã từ staging lên main

Khi bản trên `staging` đã chạy thử ổn và đủ cho một mốc (cuối sprint hoặc trước buổi báo cáo), người phụ trách mở PR từ `staging` vào `main` hoặc tự gộp. Lần này dùng **Create a merge commit**, không dùng Squash, để `staging` và `main` không bị lệch lịch sử. Sau khi gộp, không cần xóa `staging`.

## 7. Môi trường và dữ liệu

Cách chạy dự án, tài khoản mẫu và chạy kiểm thử xem trong `README.md`. Thay đổi cơ sở dữ liệu đi bằng migration mới (`npm run db:migrate`), không sửa tay migration đã gộp. Mật khẩu tài khoản mẫu chỉ dùng cho phát triển và demo. Khi triển khai thật, phải đặt `JWT_SECRET` và `SEED_PASSWORD` riêng.
