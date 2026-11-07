# Quy trình làm việc nhóm

Tài liệu này quy định cách đặt tên nhánh, viết commit, mở pull request (PR) và gộp mã từ nhánh cá nhân vào `staging`, rồi đưa lên `main`. Cả nhóm làm theo cùng một quy trình để lịch sử mã nguồn dễ đọc và hai nhánh chính luôn chạy được.

## 1. Nguyên tắc chung

Kho có hai nhánh dài hạn và ba nhánh cá nhân. Nhánh `staging` là nơi tích hợp: công việc của thành viên được gộp vào đây qua PR để cả nhóm chạy thử chung. Nhánh `main` là bản đã được duyệt, chỉ người phụ trách (trưởng nhóm hoặc người được giao) đưa mã từ `staging` lên khi thấy ổn, thành viên không mở PR hay đẩy trực tiếp vào `main`. Cả hai nhánh luôn ở trạng thái build và chạy được.

Mỗi thành viên làm việc trên đúng một nhánh của mình và không ai đẩy lên nhánh của người khác. Mọi thay đổi đi vào `staging` qua một PR, phải có kết quả kiểm tra tự động đạt và được review trước khi gộp.

## 2. Nhánh cá nhân

Mỗi người một nhánh, đặt theo tên, tạo từ `staging` và giữ lâu dài, không xóa sau khi gộp.

| Nhánh | Thành viên | Phần việc chính |
|---|---|---|
| Hung | Lưu Văn Hưng | Backend, cơ sở dữ liệu, DevOps, nghiệp vụ |
| Khoa | Trần Đăng Khoa | Frontend |
| Huy | Nguyễn Gia Huy | Tài liệu, kiểm thử |

Chức năng nào thuộc phần việc của ai thì người đó làm trên nhánh của mình và ghi mã PB vào tiêu đề commit và mô tả PR. Nhánh sống lâu dễ lệch khỏi `staging` nên cần giữ cho mới (xem mục 4). Mỗi lần xong một phần dùng được (một chức năng, một màn hình, một đợt sửa) thì mở PR vào `staging`, không dồn nhiều ngày thành một PR lớn.

## 3. Quy ước commit

Thông điệp commit viết tiếng Việt theo dạng `loai(pham-vi): mô tả ngắn`, với `loai` là một trong `feat`, `fix`, `docs`, `test`, `refactor`, `chore` và `pham-vi` là `api`, `web`, `db`, `ci`, `auth`... Mô tả viết ở thì hiện tại, không kết thúc bằng dấu chấm, tối đa khoảng 72 ký tự. Phần thân commit (nếu cần) giải thích lý do thay đổi.

Mỗi commit nên là một thay đổi trọn vẹn, ví dụ migration và model đi cùng nhau, kiểm thử đi cùng chức năng. Không đưa mật khẩu, khóa bí mật hay tệp `.env` vào commit.

Commit và mô tả PR chỉ ghi tên các thành viên nhóm. Không thêm dòng `Co-Authored-By`, dòng "Generated with", hay bất kỳ ghi công nào cho công cụ hỗ trợ.

## 4. Làm việc và mở pull request

Trước khi bắt đầu mỗi đợt việc, cập nhật nhánh của mình từ `staging` (ví dụ nhánh `Khoa`).

```
git switch Khoa
git pull origin staging
```

Làm việc, commit nhỏ, đẩy lên rồi mở PR từ nhánh của mình vào `staging`. Tiêu đề PR theo cùng dạng với commit, ví dụ `feat(web): tra cứu phòng trống (PB-06)`. Phần mô tả điền theo mẫu trong `.github/pull_request_template.md`, gồm mục tiêu, thay đổi chính, cách kiểm tra, ảnh chụp màn hình khi đổi giao diện, và ghi chú cho người review. Ghi mã công việc Jira liên quan, ví dụ SCRUM-11.

Sau khi PR được gộp, kéo `staging` về nhánh của mình ngay (`git pull origin staging`). Việc gộp dùng merge commit nên bước này chỉ là tua tới, không sinh xung đột. Nếu có người khác gộp vào `staging` trong lúc bạn đang làm, cũng chạy lệnh này để cập nhật trước khi mở PR tiếp.

## 5. Review và gộp

Sau khi mở PR, hệ thống tự chạy hai kiểm tra: kiểm thử backend và build frontend. PR chỉ được gộp khi cả hai đạt. Người review đọc theo các hướng sau: đúng yêu cầu trong Product Backlog, có kiểm thử cho nhánh xử lý mới, kiểm tra dữ liệu đầu vào và phân quyền ở phía máy chủ, migration không sửa lại migration đã gộp, và tài liệu (README, SRS, API Contract, ERD) được cập nhật nếu hành vi thay đổi.

Góp ý được xử lý bằng commit mới trên cùng nhánh, không mở PR khác. Việc gộp dùng **Create a merge commit** để giữ nguyên từng commit nhỏ của người làm và giữ nhánh cá nhân đồng bộ với `staging`. Không xóa nhánh cá nhân sau khi gộp, không dùng Squash hay Rebase cho PR từ nhánh cá nhân.

### 5.1. Claude review tự động

Mỗi PR vào `staging` được Claude review tự động (workflow `.github/workflows/claude-review.yml`). Kết quả là một bình luận ngắn trên PR, kèm nhãn trạng thái ở danh sách PR.

| Trạng thái | Nhãn | Ý nghĩa | PR sẽ |
|---|---|---|---|
| BLOCKED | claude:blocked | Có lỗi thật: logic, bảo mật, sửa migration cũ, thiếu kiểm thử, hỏng build, ghi công Claude trong commit | Dừng lại, không gộp |
| SUGGEST | claude:suggest | Code đúng nhưng có cách tốt hơn: thư viện hay hơn, tối ưu, nâng cao, dễ bảo trì hơn | Tự gộp, gợi ý không bắt buộc |
| OK | claude:ok | Không có gì cần nói thêm | Tự gộp |

Mỗi lỗi hoặc gợi ý ghi tệp và dòng, vấn đề là gì, vì sao, và cách sửa. Khi BLOCKED, sửa rồi đẩy commit mới lên cùng nhánh, Claude review lại và cập nhật chính bình luận đó. Việc tự gộp chỉ xảy ra khi CI cũng xanh, dùng merge commit vào `staging` và giữ lại nhánh cá nhân. Claude không bao giờ gộp vào `main`.

Muốn sửa gợi ý trước khi gộp, gắn nhãn `no-auto-merge` ngay khi mở PR. Claude vẫn review nhưng không gộp. Sửa xong thì gỡ nhãn, đóng rồi mở lại PR (hoặc đẩy commit mới), Claude review lại và tự gộp.

Chủ kho cần thêm secret `ANTHROPIC_API_KEY` ở Settings, Secrets and variables, Actions, và tài khoản API cần còn số dư. Chưa có secret thì workflow tự bỏ qua và PR review thủ công như bình thường.

### 5.2. Jira tự cập nhật

Trạng thái issue Jira được cập nhật tự động theo hoạt động trên GitHub (workflow `jira-sync.yml`). Để hệ thống nhận ra issue, ghi mã `SCRUM-n` hoặc mã backlog `PB-nn` vào tiêu đề hoặc mô tả PR, hoặc vào thông điệp commit.

| Sự kiện | Issue chuyển sang |
|---|---|
| Đẩy commit có mã lên nhánh cá nhân | In Progress (nếu đang To Do) |
| Mở PR, hoặc PR sẵn sàng review | In Review |
| PR chuyển về nháp hoặc bị đóng không gộp | In Progress (nếu đang In Review) |
| PR được gộp, mô tả có `Closes SCRUM-n` hoặc `Closes PB-nn` | Done |
| PR được gộp, mô tả chỉ nhắc mã | In Progress |

Trạng thái chỉ tiến lên, không bị lùi ngoài các trường hợp trên. Chỉ ghi `Closes` khi issue thật sự hoàn thành cả giao diện lẫn máy chủ. Chủ kho cần thêm ba secret `JIRA_BASE_URL` (ví dụ `https://cdtn2.atlassian.net`), `JIRA_USER_EMAIL` và `JIRA_API_TOKEN` (tạo ở id.atlassian.com, mục Security, API tokens). Chưa có secret thì workflow tự bỏ qua.

## 6. Đưa mã từ staging lên main

Khi bản trên `staging` đã chạy thử ổn và đủ cho một mốc (cuối sprint hoặc trước buổi báo cáo), người phụ trách mở PR từ `staging` vào `main` hoặc tự gộp. Lần này dùng **Create a merge commit**, không dùng Squash, để `staging` và `main` không bị lệch lịch sử. Sau khi gộp, không cần xóa `staging`.

## 7. Môi trường và dữ liệu

Cách chạy dự án, tài khoản mẫu và chạy kiểm thử xem trong `README.md`. Thay đổi cơ sở dữ liệu đi bằng migration mới (`npm run db:migrate`), không sửa tay migration đã gộp. Mật khẩu tài khoản mẫu chỉ dùng cho phát triển và demo. Khi triển khai thật, phải đặt `JWT_SECRET` và `SEED_PASSWORD` riêng.
