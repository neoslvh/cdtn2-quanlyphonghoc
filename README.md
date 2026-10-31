# Hệ thống web quản lý phòng học và thiết bị

Mã nguồn đồ án Chuyên đề Tốt nghiệp 2 của nhóm Trần Đăng Khoa, Lưu Văn Hưng, Nguyễn Gia Huy. Kiến trúc và lý do chọn công nghệ được trình bày trong tài liệu docs/Buoi4_ThietKeKienTruc_CongNghe.docx.

Ở phiên bản hiện tại, project có khung chạy thông từ đầu đến cuối (API `/api/hello`) và chức năng đăng nhập, đăng xuất, cấp tài khoản và đổi mật khẩu (FR-01, FR-02, Sprint 2).

## 1. Cấu trúc thư mục

```
backend/    API Node.js, Express, Prisma
  src/        app.js khai báo route, server.js khởi động máy chủ
  prisma/     schema, migration và dữ liệu mẫu
  tests/      kiểm thử bằng Jest và Supertest
frontend/   giao diện React, Vite, Ant Design
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

## 4. Kiểm thử

```
cd backend
npm test
```

Bộ kiểm thử có 35 ca: hai ca cho `/api/hello`, còn lại cho đăng nhập, phiên làm việc, cấp tài khoản, đổi và đặt lại mật khẩu, duyệt tài khoản và đăng ký tự do. Tất cả dùng cơ sở dữ liệu giả lập nên chạy được mà không cần PostgreSQL.

## 5. Quy trình làm việc nhóm

Mỗi công việc làm trên một nhánh riêng tạo từ `main`, đặt tên theo dạng `feat/pb-03-quan-ly-phong`, rồi mở pull request vào `main`. Pull request phải qua kiểm tra tự động (kiểm thử backend, build frontend) và được người phụ trách duyệt trước khi gộp. Quy ước đặt tên nhánh, viết commit và cách review xem trong `CONTRIBUTING.md`.
