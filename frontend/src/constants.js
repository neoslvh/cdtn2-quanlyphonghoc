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
// Cột của tệp thời khóa biểu mẫu, đúng thứ tự trong API Contract mục 1.5.5.
export const SCHEDULE_COLUMNS = ['Học kỳ', 'Mã môn', 'Tên môn', 'Lớp', 'Thứ', 'Tiết bắt đầu', 'Số tiết', 'Mã phòng', 'Từ ngày', 'Đến ngày'];
// Nhân viên cơ sở vật chất và quản trị viên quản lý phòng, thiết bị (API Contract mục 1.3).
export const canManageRooms = (u) => ['FACILITY_STAFF', 'ADMIN'].includes(u.role);
// Chỉ Phòng Đào tạo và quản trị viên được nhập lịch học chính khóa (BR-12). Đây chỉ để ẩn menu, quyền thật do máy chủ kiểm tra khi có API.
export const canManageSchedule = (u) => u.role === 'ADMIN' || (u.role === 'APPROVER' && u.organization?.name === 'Phòng Đào tạo');
