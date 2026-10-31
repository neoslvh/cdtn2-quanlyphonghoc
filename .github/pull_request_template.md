## Mục tiêu

<!-- Thay đổi này làm gì và vì sao. Ghi mã PBI/FR liên quan, ví dụ PB-01 (SCRUM-6), FR-01. -->

## Thay đổi chính

-

## Nhánh và commit

- [ ] Tên nhánh theo quy ước `loai/ma-pb-mo-ta-ngan` (xem CONTRIBUTING.md)
- [ ] Commit viết theo dạng `loai(pham-vi): mô tả`, không có dòng đồng tác giả

## Cách kiểm tra

<!-- Các bước để người review tự chạy lại. -->

- [ ] `cd backend && npm test` đạt
- [ ] `cd frontend && npm run build` thành công
- [ ] Đã chạy thử trên giao diện (`docker compose up --build`, mở http://localhost:8080)

## Ảnh chụp màn hình

<!-- Chỉ cần khi có thay đổi giao diện. -->

## Tài liệu và dữ liệu

- [ ] Có migration mới nếu đổi cơ sở dữ liệu, không sửa migration đã gộp
- [ ] Đã cập nhật README hoặc tài liệu thiết kế nếu đổi hành vi (SRS, API Contract, ERD)
- [ ] Không đưa mật khẩu, khóa bí mật hoặc tệp `.env` vào commit

## Ghi chú cho người review

<!-- Điểm cần xem kỹ, rủi ro, việc chưa làm. -->
