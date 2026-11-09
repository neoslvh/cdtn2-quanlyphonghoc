export const ROOM_TYPE = { CLASSROOM: 'Phòng học', LAB: 'Phòng máy', HALL: 'Hội trường' };
export const EQUIPMENT = { MICROPHONE: 'Micro', PROJECTOR: 'Máy chiếu', AUDIO: 'Âm thanh', AIR_CONDITIONER: 'Máy lạnh', OTHER: 'Khác' };
export const ROOM_STATUS = { AVAILABLE: ['green', 'Sẵn sàng'], UNAVAILABLE: ['default', 'Ngừng sử dụng'], MAINTENANCE: ['orange', 'Bảo trì'] };
export const CAMPUSES = ['Cơ sở 1', 'Cơ sở 2', 'Cơ sở 3'];
export const REQUEST_STATUS = {
  DRAFT: ['default', 'Nháp'],
  PENDING: ['gold', 'Đang duyệt'],
  APPROVED: ['green', 'Đã duyệt'],
  REJECTED: ['red', 'Từ chối'],
  CANCELLED: ['default', 'Đã hủy'],
};
export const SESSION_STATUS = {
  ACTIVE: ['green', 'Đang hiệu lực'],
  PENDING: ['gold', 'Chờ xác nhận'],
  CANCELLED: ['default', 'Đã hủy'],
};
export const STEP_STATUS = { PENDING: ['gold', 'Đang chờ'], WAITING: ['default', 'Chưa tới lượt'], APPROVED: ['green', 'Đã duyệt'], REJECTED: ['red', 'Từ chối'], CANCELLED: ['default', 'Đã hủy'] };
// Tên hiển thị của hành động và đối tượng trong nhật ký thao tác (FR-21).
export const AUDIT_ACTION = {
  REQUEST_CREATED: 'Tạo yêu cầu',
  REQUEST_UPDATED: 'Sửa yêu cầu',
  REQUEST_SUBMITTED: 'Gửi yêu cầu',
  REQUEST_CANCELLED: 'Hủy yêu cầu',
  REQUEST_STEP_APPROVED: 'Đồng ý một bước duyệt',
  REQUEST_APPROVED: 'Duyệt xong yêu cầu',
  REQUEST_REJECTED: 'Từ chối yêu cầu',
  REQUEST_CANCELLED_BY_SCHEDULE: 'Hủy yêu cầu do trùng lịch học chính khóa',
  ROOM_CREATED: 'Thêm phòng',
  ROOM_UPDATED: 'Sửa phòng',
  SCHEDULE_IMPORT_PREVIEWED: 'Xem trước thời khóa biểu nhập',
  SCHEDULE_IMPORT_COMMITTED: 'Xác nhận nhập thời khóa biểu',
  SCHEDULE_IMPORT_DISCARDED: 'Hủy bản xem trước thời khóa biểu',
  CLASS_SESSION_UPDATED: 'Sửa buổi học',
  CLASS_SESSION_CANCELLED: 'Hủy buổi học',
};
export const AUDIT_ENTITY = { usage_request: 'Yêu cầu', room: 'Phòng', import_batch: 'Lần nhập thời khóa biểu', class_schedule: 'Buổi học' };
// Cột của tệp thời khóa biểu mẫu, đúng thứ tự trong API Contract mục 1.5.5.
export const SCHEDULE_COLUMNS = ['Học kỳ', 'Mã môn', 'Tên môn', 'Lớp', 'Thứ', 'Tiết bắt đầu', 'Số tiết', 'Mã phòng', 'Từ ngày', 'Đến ngày'];
// Nhân viên cơ sở vật chất và quản trị viên quản lý phòng, thiết bị (API Contract mục 1.3).
export const canManageRooms = (u) => ['FACILITY_STAFF', 'ADMIN'].includes(u.role);
// Chỉ Phòng Đào tạo và quản trị viên được nhập lịch học chính khóa (BR-12). Đây chỉ để ẩn menu, quyền thật do máy chủ kiểm tra khi có API.
export const canManageSchedule = (u) => u.role === 'ADMIN' || (u.role === 'APPROVER' && u.organization?.name === 'Phòng Đào tạo');
