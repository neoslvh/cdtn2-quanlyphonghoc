# Khai báo sử dụng công cụ AI

Nhóm sử dụng Claude (Anthropic) thông qua Claude Code trong quá trình làm Sprint 2 của đồ án.

## 1. Công cụ được dùng để làm gì

- Viết mã nguồn backend (API, kiểm tra dữ liệu, giao dịch cơ sở dữ liệu), giao diện và bộ kiểm thử theo thiết kế đã chốt (SRS 1.4, API Contract 1.0, ERD 4.1, wireframe 2.0).
- Viết kịch bản kiểm thử Playwright, test plan, test report, bug log.
- Review mã tự động trên mỗi pull request vào `staging` bằng GitHub Action (workflow `claude-review.yml`). Review chỉ nhận xét và gắn nhãn BLOCKED, SUGGEST hoặc OK, và không tự sửa mã.

## 2. Phần do nhóm quyết định

- Phạm vi, quy tắc nghiệp vụ, kiến trúc, công nghệ và phân vai các thành viên.
- Quyết định gộp mã lên `main`: chỉ người phụ trách được đưa mã từ `staging` lên `main`.
- Duyệt kết quả cuối cùng và chịu trách nhiệm về tính đúng đắn của mọi nội dung nộp.

## 3. Cách kiểm soát chất lượng phần AI viết

- Mọi thay đổi đi qua pull request, phải qua CI (kiểm thử unit, API, tích hợp PostgreSQL thật, giao diện) và review tự động trước khi gộp.
- Lỗi do review hoặc kiểm thử phát hiện được sửa bằng commit riêng và ghi ở `docs/bug-log.md`.
- Các quy tắc nghiệp vụ được kiểm thử trên cơ sở dữ liệu thật, gồm cả các trường hợp truy cập đồng thời, thay vì chỉ kiểm thử bằng dữ liệu giả.

## 4. Ghi công

Lịch sử commit chỉ đứng tên các thành viên nhóm. Công cụ AI không được ghi là tác giả hay người đóng góp của kho mã.
