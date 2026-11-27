import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './auth';
import AdminUsers from './pages/AdminUsers';
import ApprovalRules from './pages/ApprovalRules';
import AuditLog from './pages/AuditLog';
import Approvals from './pages/Approvals';
import { canManageRooms, canManageSchedule, canViewFacility } from './constants';
import ChangePassword from './pages/ChangePassword';
import ClassSchedule from './pages/ClassSchedule';
import Equipment from './pages/Equipment';
import Facility from './pages/Facility';
import Home from './pages/Home';
import Login from './pages/Login';
import MyRequests from './pages/MyRequests';
import NotFound from './pages/NotFound';
import Notifications from './pages/Notifications';
import QrInfo from './pages/QrInfo';
import Register from './pages/Register';
import Reports from './pages/Reports';
import RequestDetail from './pages/RequestDetail';
import RequestForm from './pages/RequestForm';
import RoomManage from './pages/RoomManage';
import RoomSearch from './pages/RoomSearch';
import Shell from './pages/Shell';

// Chặn trang cần đăng nhập, và tùy chọn chặn theo vai trò. Quyền thật vẫn do API kiểm tra, đây chỉ để giao diện không hiện trang sai.
function Protected({ roles, allow, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spin fullscreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  // Mật khẩu tạm hoặc vừa được đặt lại: chỉ được vào trang đổi mật khẩu.
  if (user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  if ((roles && !roles.includes(user.role)) || (allow && !allow(user))) return <Navigate to="/" replace />;
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
          <Route path="rooms/search" element={<RoomSearch />} />
          <Route path="rooms" element={<Protected allow={canManageRooms}><RoomManage /></Protected>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="qr/:token" element={<QrInfo />} />
          <Route path="approvals" element={<Protected roles={['APPROVER']}><Approvals /></Protected>} />
          <Route path="requests" element={<Protected roles={['REQUESTER', 'ADMIN']}><MyRequests /></Protected>} />
          <Route path="requests/new" element={<Protected roles={['REQUESTER']}><RequestForm /></Protected>} />
          <Route path="requests/:id" element={<Protected roles={['REQUESTER', 'ADMIN', 'FACILITY_STAFF']}><RequestDetail /></Protected>} />
          <Route path="requests/:id/edit" element={<Protected roles={['REQUESTER']}><RequestForm /></Protected>} />
          <Route path="class-schedule" element={<Protected allow={canManageSchedule}><ClassSchedule /></Protected>} />
          <Route path="admin/audit" element={<Protected roles={['ADMIN']}><AuditLog /></Protected>} />
          <Route path="admin/users" element={<Protected roles={['ADMIN']}><AdminUsers /></Protected>} />
          <Route path="admin/reports" element={<Protected roles={['ADMIN']}><Reports /></Protected>} />
          <Route path="admin/approval-rules" element={<Protected roles={['ADMIN']}><ApprovalRules /></Protected>} />
          <Route path="equipment" element={<Protected allow={canManageRooms}><Equipment /></Protected>} />
          <Route path="facility" element={<Protected allow={canViewFacility}><Facility /></Protected>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
