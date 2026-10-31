import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './auth';
import AdminUsers from './pages/AdminUsers';
import ChangePassword from './pages/ChangePassword';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Shell from './pages/Shell';

// Chặn trang cần đăng nhập, và tùy chọn chặn theo vai trò. Quyền thật vẫn do API kiểm tra, đây chỉ để giao diện không hiện trang sai.
function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spin fullscreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Mật khẩu tạm hoặc vừa được đặt lại: chỉ được vào trang đổi mật khẩu.
  if (user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<Protected><Shell /></Protected>}>
          <Route index element={<Home />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="admin/users" element={<Protected roles={['ADMIN']}><AdminUsers /></Protected>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
