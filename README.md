# Hệ thống web quản lý phòng học và thiết bị

Mã nguồn đồ án Chuyên đề Tốt nghiệp 2 của nhóm Trần Đăng Khoa, Lưu Văn Hưng, Nguyễn Gia Huy. Kiến trúc và lý do chọn công nghệ được trình bày trong tài liệu docs/Buoi4_ThietKeKienTruc_CongNghe.docx.

Ở phiên bản hiện tại, project mới có phần khung chạy thông từ đầu đến cuối: trang React gọi API `/api/hello`, API đếm số phòng trong PostgreSQL và trả kết quả về để hiển thị.

## 1. Cấu trúc thư mục

```
backend/    API Node.js, Express, Prisma
  src/        app.js khai báo route, server.js khởi động máy chủ
  prisma/     schema, migration và dữ liệu mẫu
  tests/      kiểm thử bằng Jest và Supertest
frontend/   giao diện React, Vite, Ant Design
docs/       SRS, Product Backlog, tài liệu thiết kế kiến trúc
docker-compose.yml   chạy cả cơ sở dữ liệu, API và giao diện
```

## 2. Chạy bằng Docker

Máy cần cài Docker Desktop. Tại thư mục gốc của project, chạy:

```
docker compose up --build
```

Sau khi các container khởi động xong, mở http://localhost:8080. Trang sẽ hiện lời chào từ API và số phòng mẫu là 2. Lần chạy đầu, container API tự tạo bảng và nạp dữ liệu mẫu.

## 3. Chạy trực tiếp trên máy

Cách này dùng khi lập trình, cần Node.js 24 và PostgreSQL đã cài sẵn.

### 3.1. Backend

Tạo cơ sở dữ liệu tên `qlphong`, chép tệp `backend/.env.example` thành `backend/.env` và sửa lại tài khoản, mật khẩu PostgreSQL của máy mình. Sau đó chạy:

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

Bộ kiểm thử hiện có hai ca cho route `/api/hello`: trả về đúng lời chào và số phòng, và trả về mã 500 khi cơ sở dữ liệu lỗi. Hai ca này dùng cơ sở dữ liệu giả lập nên chạy được mà không cần PostgreSQL.
