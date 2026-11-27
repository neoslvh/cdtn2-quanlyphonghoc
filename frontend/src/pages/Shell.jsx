import { NavLink, Outlet } from 'react-router-dom';
import { Badge, Button } from 'antd';
import { USE_MOCK } from '../api';
import { useAuth } from '../auth';
import { canManageRooms, canManageSchedule, canViewFacility } from '../constants';
import { useUnreadCount } from '../notifications';

export const ROLE_LABEL = {
  REQUESTER: 'Người đăng ký',
  APPROVER: 'Người duyệt',
  FACILITY_STAFF: 'Nhân viên cơ sở vật chất',
  ADMIN: 'Quản trị viên',
};

// Các mục menu theo vai trò, dạng [đường dẫn, nhãn, khớp chính xác]. Quyền thật vẫn do máy chủ kiểm tra.
export function navItems(user) {
  const items = [['/', 'Trang chủ', true], ['/rooms/search', 'Tra cứu phòng']];
  if (user.role === 'REQUESTER') items.push(['/requests/new', 'Tạo yêu cầu'], ['/requests', 'Yêu cầu của tôi', true]);
  if (user.role === 'APPROVER') items.push(['/approvals', 'Duyệt yêu cầu']);
  if (user.role === 'ADMIN') items.push(['/requests', 'Tất cả yêu cầu', true]);
  if (canManageRooms(user)) items.push(['/rooms', 'Quản lý phòng', true], ['/equipment', 'Thiết bị']);
  if (canViewFacility(user)) items.push(['/facility', 'Bàn giao và báo hỏng']);
  if (canManageSchedule(user)) items.push(['/class-schedule', 'Lịch học chính khóa']);
  if (user.role === 'ADMIN') items.push(['/admin/users', 'Tài khoản'], ['/admin/audit', 'Nhật ký'], ['/admin/reports', 'Báo cáo'], ['/admin/approval-rules', 'Quy tắc duyệt']);
  return items;
}

// Khung chung của các trang sau đăng nhập. Tầng trên: logo và tài khoản. Tầng dưới: menu theo vai trò, trên điện thoại cuộn ngang.
export default function Shell() {
  const { user, logout } = useAuth();
  const unread = useUnreadCount();
  return (
    <>
      <header className="app-top">
        <div className="app-top-row">
          <img src="/vlu-logo.webp" alt="Van Lang University" />
          <div className="app-user">
            <div className="app-user-name">
              <b>{user.fullName}</b>
              <small>{ROLE_LABEL[user.role]}</small>
            </div>
            <NavLink to="/notifications" className="app-user-link" aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}>
              <Badge count={unread} overflowCount={99} size="small" offset={[8, -2]}>Thông báo</Badge>
            </NavLink>
            <NavLink to="/change-password" className="app-user-link">Đổi mật khẩu</NavLink>
            <Button onClick={logout}>Đăng xuất</Button>
          </div>
        </div>
        <nav aria-label="Điều hướng chính">
          {navItems(user).map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
        </nav>
      </header>
      {USE_MOCK && <div className="mock-banner">Đang dùng dữ liệu chạy thử cho các chức năng chưa có API. Dữ liệu sẽ mất khi tải lại trang.</div>}
      <Outlet />
    </>
  );
}
