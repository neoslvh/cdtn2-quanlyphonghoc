import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, message } from 'antd';
import { api, setToken } from '../api';
import { useAuth } from '../auth';

const PASSWORD_RULES = [
  { required: true, message: 'Vui lòng nhập mật khẩu mới' },
  { min: 8, message: 'Mật khẩu tối thiểu 8 ký tự' },
  { max: 72, message: 'Mật khẩu tối đa 72 ký tự' },
  { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: 'Mật khẩu phải gồm cả chữ và số' },
];

export default function ChangePassword() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onFinish = async ({ currentPassword, newPassword }) => {
    setBusy(true);
    setError(null);
    try {
      const d = await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      setToken(d.token);
      setUser(d.user);
      message.success('Đã đổi mật khẩu');
      navigate('/', { replace: true });
    } catch (err) {
      const fields = (err.details || []).filter((x) => x.field).map((x) => ({ name: x.field, errors: [x.message] }));
      if (fields.length) form.setFields(fields);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="app-band">
        <h1>Đổi mật khẩu</h1>
        <p>{user.mustChangePassword ? 'Bạn đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới để tiếp tục sử dụng hệ thống.' : 'Nhập mật khẩu hiện tại và mật khẩu mới.'}</p>
      </section>
      <div className="app-content">
        <div className="auth-card" style={{ margin: '0 auto' }}>
          {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} title={error} />}
          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item label="Mật khẩu hiện tại" name="currentPassword" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}>
              <Input.Password autoComplete="current-password" size="large" />
            </Form.Item>
            <Form.Item label="Mật khẩu mới" name="newPassword" rules={PASSWORD_RULES}>
              <Input.Password autoComplete="new-password" placeholder="Ít nhất 8 ký tự, gồm chữ và số" size="large" />
            </Form.Item>
            <Form.Item
              label="Nhập lại mật khẩu mới"
              name="confirm"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Vui lòng nhập lại mật khẩu mới' },
                ({ getFieldValue }) => ({
                  validator: (_, v) => (!v || getFieldValue('newPassword') === v ? Promise.resolve() : Promise.reject(new Error('Mật khẩu nhập lại không khớp'))),
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={busy}>
              Đổi mật khẩu
            </Button>
          </Form>
        </div>
      </div>
    </>
  );
}
