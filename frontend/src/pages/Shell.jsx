import { NavLink, Outlet } from 'react-router-dom';
import { Button } from 'antd';
import { USE_MOCK } from '../api';
import { useAuth } from '../auth';
import { canManageRooms, canManageSchedule } from '../constants';

export const ROLE_LABEL = {
  REQUESTER: 'Người đăng ký',
  APPROVER: 'Người duyệt',
  FACILITY_STAFF: 'Nhân viên cơ sở vật chất',
  ADMIN: 'Quản trị viên',
};

// Khung chung của các trang sau đăng nhập: thanh trên có logo, điều hướng theo vai trò và nút đăng xuất.
export default function Shell() {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="app-top">
        <img src="/vlu-logo.webp" alt="Van Lang University" />
        <nav>
          <NavLink to="/" end>Trang chủ</NavLink>
          <NavLink to="/rooms/search">Tra cứu phòng</NavLink>
          {user.role === 'REQUESTER' && <NavLink to="/requests/new">Tạo yêu cầu</NavLink>}
          {canManageRooms(user) && <NavLink to="/rooms" end>Quản lý phòng</NavLink>}
          {canManageSchedule(user) && <NavLink to="/class-schedule">Lịch học chính khóa</NavLink>}
          {user.role === 'ADMIN' && <NavLink to="/admin/users">Tài khoản</NavLink>}
        </nav>
        <div className="app-user">
          <div>
            <b>{user.fullName}</b>
            <small>{ROLE_LABEL[user.role]}</small>
          </div>
          <NavLink to="/change-password" style={{ fontSize: 13 }}>Đổi mật khẩu</NavLink>
          <Button onClick={logout}>Đăng xuất</Button>
        </div>
      </header>
      {USE_MOCK && <div className="mock-banner">Đang dùng dữ liệu chạy thử cho phòng, yêu cầu và lịch học. Dữ liệu sẽ mất khi tải lại trang.</div>}
      <Outlet />
    </>
  );
}
