# Hệ thống web quản lý phòng học và thiết bị

Mã nguồn đồ án Chuyên đề Tốt nghiệp 2 của nhóm Trần Đăng Khoa, Lưu Văn Hưng, Nguyễn Gia Huy. Kiến trúc và lý do chọn công nghệ được trình bày trong tài liệu docs/Buoi4_ThietKeKienTruc_CongNghe.docx.

Ở phiên bản hiện tại, hệ thống có đăng nhập, cấp tài khoản và đổi mật khẩu (FR-01, FR-02), quản lý phòng (FR-03), tra cứu phòng trống (FR-06), lập, gửi và hủy yêu cầu sử dụng phòng (FR-07, FR-08, FR-09) và quản lý lịch học chính khóa của Phòng Đào tạo (FR-23), tức toàn bộ phạm vi Sprint 2. Duyệt yêu cầu, thiết bị, thông báo và các chức năng còn lại làm ở các sprint sau.

## 1. Cấu trúc thư mục

```
backend/    API Node.js, Express, Prisma
  src/routes/        nhận request HTTP, đổi lỗi nghiệp vụ thành mã HTTP
  src/services/      quy tắc nghiệp vụ, không chứa gì về HTTP hay SQL
  src/repositories/  đọc ghi PostgreSQL bằng Prisma, không chứa quy tắc nghiệp vụ
  src/validators/    kiểm tra định dạng dữ liệu vào
  prisma/            schema, migration và dữ liệu mẫu
  tests/unit/        test tầng service với repository giả
  tests/api/         test qua HTTP với supertest
  tests/integration/ test trên PostgreSQL thật (RUN_PG_TESTS=1)
frontend/   giao diện React, Vite, Ant Design
e2e/        kiểm thử tự động giao diện bằng Playwright
docs/       SRS, Product Backlog, tài liệu thiết kế kiến trúc, API_XacThuc.md
.github/    CI, mẫu pull request, CODEOWNERS
CONTRIBUTING.md   quy trình nhánh, commit, pull request
docker-compose.yml   chạy cả cơ sở dữ liệu, API và giao diện
```

## 2. Chạy bằng Docker

Máy cần cài Docker Desktop. Tại thư mục gốc của project, chạy:

```
docker compose up --build
```

Sau khi các container khởi động xong, mở http://localhost:8080. Lần chạy đầu, container API tự tạo bảng và nạp dữ liệu mẫu.

### 2.1. Tài khoản mẫu

Mật khẩu mặc định của ba tài khoản dưới đây là `Demo@12345` (đổi bằng biến `SEED_PASSWORD`). Chỉ dùng cho phát triển và demo.

| Email | Vai trò |
|---|---|
| admin@qlphong.local | ADMIN, duyệt tài khoản tại mục Tài khoản |
| csvc@qlphong.local | FACILITY_STAFF |
| daotao@qlphong.local | APPROVER |

Tài khoản do quản trị viên cấp (FR-01, US-17): ADMIN vào mục Tài khoản, chọn Thêm tài khoản, hệ thống sinh mật khẩu tạm và chỉ hiện một lần. Người dùng bắt buộc đổi mật khẩu ở lần đăng nhập đầu, cũng như sau khi ADMIN đặt lại mật khẩu. Hiện chưa tích hợp được tài khoản của trường nên không dùng đăng nhập một lần (SSO).

Trang đăng ký tự do (/register, tài khoản chờ ADMIN duyệt) có sẵn nhưng mặc định tắt. Đặt biến môi trường `ALLOW_SELF_REGISTRATION=true` cho API để mở.

## 3. Chạy trực tiếp trên máy

Cách này dùng khi lập trình, cần Node.js 24 và PostgreSQL đã cài sẵn.

### 3.1. Backend

Tạo cơ sở dữ liệu tên `qlphong`, chép tệp `backend/.env.example` thành `backend/.env`, sửa lại tài khoản, mật khẩu PostgreSQL của máy mình và đặt `JWT_SECRET` riêng. Sau đó chạy:

```
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

API chạy tại http://localhost:3000/api/hello.

### 3.2. Frontend

Mở một cửa sổ dòng lệnh khác:

```
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173. Vite tự chuyển các lời gọi `/api` sang backend ở cổng 3000.

Giao diện gọi API thật qua proxy. Muốn chạy riêng giao diện mà không cần backend (ví dụ để demo hay phát triển màn hình mới), đặt `VITE_API_MOCK=true` để dùng dữ liệu giả trong `frontend/src/mock`, theo đúng API Contract; khi đó có biểu ngữ báo rõ và dữ liệu mất khi tải lại trang. Muốn Vite chuyển `/api` tới máy chủ khác cổng 3000, đặt biến `API_TARGET`.

## 4. Kiểm thử

Bốn tầng kiểm thử, từ nhanh đến chậm.

Tầng unit và API của backend không cần cơ sở dữ liệu, dùng repository giả trong bộ nhớ:

```
cd backend
npm test
```

Tầng tích hợp chạy trên PostgreSQL thật (migration, ràng buộc loại trừ GiST, giao dịch, truy cập đồng thời). Cần cơ sở dữ liệu đã `npm run db:migrate` và `npm run db:seed`:

```
cd backend
RUN_PG_TESTS=1 DATABASE_URL=postgresql://qlphong:qlphong_dev@localhost:5433/qlphong npx jest tests/integration
```

Giao diện có test cho lớp dữ liệu giả (`cd frontend && npm test`). Kiểm thử tự động toàn hệ thống bằng Playwright chạy trên hệ thống đã dựng bằng Docker, dùng Chrome cài sẵn trên máy:

```
docker compose up -d --build
cd e2e
npm install
npx playwright test
```

Đổi địa chỉ hệ thống bằng biến `E2E_BASE_URL` (mặc định http://localhost:8080). Báo cáo xem bằng `npm run report`. CI chạy unit, API, tích hợp PostgreSQL, build và test giao diện, kiểm thử script Jira; bộ Playwright chạy tay vì cần dựng cả hệ thống.

## 5. Quy trình làm việc nhóm

Mỗi người làm trên nhánh cá nhân của mình (`Hung`, `Khoa`, `Huy`), cập nhật từ `staging` trước khi làm, rồi mở pull request từ nhánh đó vào `staging`. Pull request phải qua kiểm tra tự động (kiểm thử backend, build frontend) và được người phụ trách duyệt trước khi gộp. PR vào `staging` được Claude review tự động, đạt thì tự gộp, không đạt thì dừng kèm góp ý. Nhánh `main` chỉ do người phụ trách đưa mã lên từ `staging` khi bản chạy thử ổn. Quy ước đặt tên nhánh, viết commit và cách review xem trong `CONTRIBUTING.md`.
