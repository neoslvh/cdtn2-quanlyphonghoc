import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Alert, Button, Form, Input } from 'antd';
import { SESSION_EXPIRED } from '../api';
import { useAuth, useServerConfig } from '../auth';
import AuthLayout from './AuthLayout';

export default function Login() {
  const { user, login } = useAuth();
  const config = useServerConfig();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [expired] = useState(() => {
    const v = sessionStorage.getItem(SESSION_EXPIRED);
    sessionStorage.removeItem(SESSION_EXPIRED);
    return Boolean(v);
  });
  const [busy, setBusy] = useState(false);

  // Đã đăng nhập (kể cả ngay sau khi bấm Đăng nhập) thì về đúng trang đang mở dở trước khi bị đưa ra trang đăng nhập.
  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const onFinish = async ({ email, password }) => {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      // 403 là tài khoản chờ duyệt hoặc bị khóa, báo bằng mức cảnh báo thay vì lỗi.
      setError({ type: err.status === 403 ? 'warning' : 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <h2>Đăng nhập</h2>
        <p className="sub">Dùng email và mật khẩu do quản trị viên cấp.</p>
        {location.state?.registered && (
          <Alert type="success" showIcon style={{ marginBottom: 16 }} title="Đăng ký thành công" description="Tài khoản đang chờ quản trị viên duyệt. Bạn đăng nhập được sau khi được duyệt." />
        )}
        {expired && !error && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title="Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại." />}
        {error && <Alert type={error.type} showIcon style={{ marginBottom: 16 }} title={error.text} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false} autoComplete="on">
          <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Vui lòng nhập email' }, { type: 'email', message: 'Email không đúng định dạng' }]}>
            <Input autoComplete="username" placeholder="ten@vlu.edu.vn" size="large" />
          </Form.Item>
          <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
            <Input.Password autoComplete="current-password" placeholder="Nhập mật khẩu" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>
            Đăng nhập
          </Button>
        </Form>
        <div className="switch">
          {config?.selfRegistration ? (
            <>Chưa có tài khoản? <Link to="/register">Đăng ký</Link></>
          ) : (
            'Chưa có tài khoản? Liên hệ quản trị viên để được cấp tài khoản.'
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
