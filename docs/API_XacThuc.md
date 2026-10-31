# API xác thực và quản lý tài khoản

Tài liệu này bổ sung cho SRS (FR-01, FR-02, US-17) và ERD v4.1, ghi lại phần đã cài đặt ở Sprint 2. Mọi đường dẫn nằm dưới `/api`. Lỗi trả về theo mẫu `{ "error": { "code", "message", "details" } }`, trong đó `details` là danh sách `{ field, message }` khi lỗi do dữ liệu nhập.

## 1. Các endpoint

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | /auth/config | Công khai | Cho biết hệ thống có mở đăng ký tự do hay không (`selfRegistration`). |
| GET | /organizations | Công khai khi bật đăng ký tự do, còn lại cần đăng nhập | Danh sách đơn vị. Tham số `scope=all` trả cả đơn vị duyệt và đơn vị cơ sở vật chất, bắt buộc đăng nhập. |
| POST | /auth/register | Công khai, chỉ khi `ALLOW_SELF_REGISTRATION=true` | Tạo tài khoản REQUESTER ở trạng thái PENDING. Khi tắt trả 404. |
| POST | /auth/login | Công khai | Trả `token` (JWT 8 giờ) và `user`. |
| GET | /auth/me | Đã đăng nhập | Thông tin người dùng hiện tại. |
| POST | /auth/logout | Đã đăng nhập | Trả 204. Máy khách tự xóa token. |
| POST | /auth/change-password | Đã đăng nhập | Đổi mật khẩu, trả `user` và `token` mới. |
| GET | /users | ADMIN | Danh sách tài khoản, lọc theo `status`. |
| POST | /users | ADMIN | Cấp tài khoản, trả `user` và `temporaryPassword` (chỉ hiện một lần). |
| PATCH | /users/:id | ADMIN | Đổi `status`, `role`, `fullName`, hoặc đặt `resetPassword: true` để sinh mật khẩu tạm mới. |

## 2. Quy tắc nghiệp vụ

Mật khẩu có từ 8 ký tự, tối đa 72 byte (bcrypt chỉ đọc 72 byte đầu, ký tự có dấu chiếm nhiều byte), gồm cả chữ và số. Mật khẩu tạm gồm 12 ký tự, sinh ngẫu nhiên bằng bộ sinh số mật mã.

Tài khoản do ADMIN cấp hoặc đặt lại mật khẩu có `mustChangePassword = true`. Khi đó mọi endpoint trừ `/auth/me`, `/auth/logout`, `/auth/change-password` trả 403 với mã `PASSWORD_CHANGE_REQUIRED`.

Đăng nhập sai 5 lần theo cùng một email trong 15 phút thì bị khóa tạm (429, `TOO_MANY_ATTEMPTS`). Đổi mật khẩu dùng cùng giới hạn cho việc nhập sai mật khẩu hiện tại. Bộ đếm nằm trong bộ nhớ tiến trình nên mất khi khởi động lại và không dùng chung giữa nhiều tiến trình. Hệ quả cần biết: người ngoài có thể cố ý nhập sai để khóa tạm một email.

Trạng thái tài khoản được đọc lại từ cơ sở dữ liệu ở mỗi request, nên khóa tài khoản có hiệu lực ngay. Token cấp trước lần đổi hoặc đặt lại mật khẩu gần nhất bị từ chối (so theo giây).

ADMIN không thể tự đổi vai trò hoặc tự khóa tài khoản của chính mình (409, `INVALID_STATE`).

## 3. Thay đổi so với ERD v4.1

Bảng `user` có thêm hai cột.

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| must_change_password | boolean, mặc định false | Bắt đổi mật khẩu ở lần đăng nhập kế tiếp. |
| password_changed_at | timestamptz, cho phép null | Mốc đổi mật khẩu gần nhất, dùng để thu hồi token cũ. |
