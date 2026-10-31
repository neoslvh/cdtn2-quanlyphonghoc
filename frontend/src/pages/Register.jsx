import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, Select } from 'antd';
import { api } from '../api';
import { useAuth, useServerConfig } from '../auth';
import AuthLayout from './AuthLayout';

// Chỉ dùng được khi máy chủ bật ALLOW_SELF_REGISTRATION. Mặc định tài khoản do quản trị viên cấp.
export default function Register() {
  const { user } = useAuth();
  const config = useServerConfig();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [orgs, setOrgs] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/organizations')
      .then((d) => setOrgs(d.items))
      .catch((err) => setError(err.message));
  }, []);

  if (user || (config && !config.selfRegistration)) return <Navigate to={user ? '/' : '/login'} replace />;

  const onFinish = async ({ confirm, ...values }) => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/register', { method: 'POST', body: values });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (err) {
      // Lỗi theo từng trường hiện ngay dưới ô nhập, các lỗi còn lại hiện ở đầu form.
      const fields = (err.details || []).filter((d) => d.field).map((d) => ({ name: d.field, errors: [d.message] }));
      if (fields.length) form.setFields(fields);
      else if (err.code === 'EMAIL_EXISTS') form.setFields([{ name: 'email', errors: [err.message] }]);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <h2>Đăng ký tài khoản</h2>
        <p className="sub">Tài khoản mới cần quản trị viên duyệt trước khi sử dụng.</p>
        {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} title={error} />}
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} autoComplete="on">
          <Form.Item label="Họ và tên" name="fullName" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }, { min: 2, message: 'Họ và tên tối thiểu 2 ký tự' }, { max: 150, message: 'Họ và tên tối đa 150 ký tự' }]}>
            <Input autoComplete="name" placeholder="Nguyễn Văn A" size="large" />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Vui lòng nhập email' }, { type: 'email', message: 'Email không đúng định dạng' }]}>
            <Input autoComplete="email" placeholder="ten@vlu.edu.vn" size="large" />
          </Form.Item>
          <Form.Item label="Đơn vị" name="organizationId" rules={[{ required: true, message: 'Vui lòng chọn đơn vị' }]}>
            <Select
              size="large"
              placeholder="Chọn khoa hoặc phòng ban"
              showSearch={{ optionFilterProp: 'label' }}
              options={orgs.map((o) => ({ value: o.id, label: o.name }))}
            />
          </Form.Item>
          <Form.Item
            label="Mật khẩu"
            name="password"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
              { min: 8, message: 'Mật khẩu tối thiểu 8 ký tự' },
              { max: 72, message: 'Mật khẩu tối đa 72 ký tự' },
              { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: 'Mật khẩu phải gồm cả chữ và số' },
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="Ít nhất 8 ký tự, gồm chữ và số" size="large" />
          </Form.Item>
          <Form.Item
            label="Nhập lại mật khẩu"
            name="confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Vui lòng nhập lại mật khẩu' },
              ({ getFieldValue }) => ({
                validator: (_, v) => (!v || getFieldValue('password') === v ? Promise.resolve() : Promise.reject(new Error('Mật khẩu nhập lại không khớp'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="Nhập lại mật khẩu" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>
            Đăng ký
          </Button>
        </Form>
        <div className="switch">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
