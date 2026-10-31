import { NavLink, Outlet } from 'react-router-dom';
import { Button } from 'antd';
import { useAuth } from '../auth';

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
      <Outlet />
    </>
  );
}
