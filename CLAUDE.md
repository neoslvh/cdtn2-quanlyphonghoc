# Hướng dẫn cho Claude khi làm việc trong kho này

Kho chứa đồ án Hệ thống web quản lý phòng học và thiết bị. Nhánh `staging` là nơi gộp PR của thành viên, nhánh `main` chỉ do người phụ trách đưa mã lên từ `staging`. Quy trình đầy đủ nằm trong `CONTRIBUTING.md`, cách chạy trong `README.md`. Khi review PR hoặc viết mã, làm theo các điểm dưới đây.

## 1. Ghi công

Không thêm Claude vào bất kỳ chỗ nào làm người đóng góp. Cụ thể: không dùng dòng `Co-Authored-By` có tên Claude hoặc Anthropic trong commit, không thêm dòng "Generated with Claude Code" hay ghi chú tương tự vào mô tả PR, bình luận hay tài liệu. Chỉ ghi tên các thành viên nhóm. Quy định này áp dụng cho mọi commit và PR, kể cả khi công cụ hoặc mẫu mặc định gợi ý thêm.

## 2. Quy ước mã

Backend dùng Node.js, Express 5 và Prisma, kiểm thử bằng Jest và Supertest với cơ sở dữ liệu giả, giao diện dùng React, Vite và Ant Design. Lỗi API trả về dạng `{ "error": { "code", "message", "details" } }`. Thông báo cho người dùng, thông điệp commit và tài liệu viết bằng tiếng Việt có dấu. Tên nhánh và mã nguồn viết không dấu.

## 3. Điều cần kiểm khi review

Kiểm tra dữ liệu đầu vào và phân quyền ở máy chủ chứ không chỉ ở giao diện, mật khẩu và khóa bí mật không nằm trong mã, migration mới thay vì sửa migration cũ, kiểm thử cho mỗi nhánh xử lý mới, và tài liệu cập nhật khi đổi hành vi. Nêu lỗi theo mức độ, chỉ rõ tệp và dòng, đề xuất cách sửa ngắn gọn.
