import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { api } from '../api';
import { useAuth } from '../auth';
import { ROLE_LABEL } from './Shell';

const STATUS = { PENDING: ['gold', 'Chờ duyệt'], ACTIVE: ['green', 'Hoạt động'], LOCKED: ['red', 'Đã khóa'] };
const roleOptions = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));

// Mật khẩu tạm chỉ hiện đúng một lần, admin sao chép gửi cho người dùng.
function showTempPassword(user, temporaryPassword) {
  Modal.success({
    title: 'Mật khẩu tạm',
    content: (
      <div>
        <p>
          Gửi mật khẩu này cho <b>{user.fullName}</b> ({user.email}). Hệ thống sẽ không hiện lại, và người dùng phải đổi mật khẩu ở lần đăng nhập đầu.
        </p>
        <Typography.Text code copyable style={{ fontSize: 18 }}>{temporaryPassword}</Typography.Text>
      </div>
    ),
    okText: 'Đã sao chép',
  });
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    setLoading(true);
    api(`/users${filter ? `?status=${filter}` : ''}`)
      .then((d) => setItems(d.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filter]);
  useEffect(load, [load]);
  useEffect(() => {
    api('/organizations?scope=all').then((d) => setOrgs(d.items)).catch((err) => setError(err.message));
  }, []);

  const update = async (id, body) => {
    try {
      const d = await api(`/users/${id}`, { method: 'PATCH', body });
      message.success('Đã cập nhật tài khoản');
      if (d.temporaryPassword) showTempPassword(d.user, d.temporaryPassword);
      load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const create = async (values) => {
    setSaving(true);
    try {
      const d = await api('/users', { method: 'POST', body: values });
      setCreating(false);
      form.resetFields();
      showTempPassword(d.user, d.temporaryPassword);
      load();
    } catch (err) {
      const fields = (err.details || []).filter((x) => x.field).map((x) => ({ name: x.field, errors: [x.message] }));
      if (fields.length) form.setFields(fields);
      else if (err.code === 'EMAIL_EXISTS') form.setFields([{ name: 'email', errors: [err.message] }]);
      else message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Họ và tên', dataIndex: 'fullName' },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Đơn vị', render: (_, u) => u.organization?.name },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      render: (role, u) => (
        <Select value={role} style={{ width: 210 }} disabled={u.id === me.id} onChange={(v) => update(u.id, { role: v })} options={roleOptions} />
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (s, u) => (
        <Space size={4}>
          <Tag color={STATUS[s][0]}>{STATUS[s][1]}</Tag>
          {u.mustChangePassword && <Tag>Chưa đổi mật khẩu</Tag>}
        </Space>
      ),
    },
    {
      title: '',
      render: (_, u) => (
        <Space wrap>
          {u.id !== me.id && u.status !== 'ACTIVE' && <Button type="primary" onClick={() => update(u.id, { status: 'ACTIVE' })}>{u.status === 'PENDING' ? 'Duyệt' : 'Mở khóa'}</Button>}
          {u.id !== me.id && u.status !== 'LOCKED' && <Button danger onClick={() => update(u.id, { status: 'LOCKED' })}>{u.status === 'PENDING' ? 'Từ chối' : 'Khóa'}</Button>}
          {u.id !== me.id && (
            <Popconfirm title="Đặt lại mật khẩu?" description="Mật khẩu cũ sẽ mất hiệu lực ngay." okText="Đặt lại" cancelText="Hủy" onConfirm={() => update(u.id, { resetPassword: true })}>
              <Button>Đặt lại mật khẩu</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <section className="app-band">
        <h1>Quản lý tài khoản</h1>
        <p>Cấp tài khoản mới, gán vai trò, khóa hoặc mở khóa và đặt lại mật khẩu.</p>
      </section>
      <div className="app-content">
        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <span>Lọc theo trạng thái:</span>
            <Select
              value={filter}
              style={{ width: 180 }}
              onChange={setFilter}
              options={[{ value: '', label: 'Tất cả' }, ...Object.entries(STATUS).map(([value, [, label]]) => ({ value, label }))]}
            />
          </Space>
          <Button type="primary" onClick={() => setCreating(true)}>Thêm tài khoản</Button>
        </Space>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={items} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 1000 }} locale={{ emptyText: 'Không có tài khoản nào' }} />
      </div>

      <Modal title="Thêm tài khoản" open={creating} onCancel={() => setCreating(false)} onOk={() => form.submit()} okText="Tạo tài khoản" cancelText="Hủy" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={create} requiredMark={false} initialValues={{ role: 'REQUESTER' }}>
          <Form.Item label="Họ và tên" name="fullName" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }, { min: 2, message: 'Họ và tên tối thiểu 2 ký tự' }, { max: 150, message: 'Họ và tên tối đa 150 ký tự' }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Vui lòng nhập email' }, { type: 'email', message: 'Email không đúng định dạng' }]}>
            <Input placeholder="ten@vlu.edu.vn" />
          </Form.Item>
          <Form.Item label="Đơn vị" name="organizationId" rules={[{ required: true, message: 'Vui lòng chọn đơn vị' }]}>
            <Select placeholder="Chọn đơn vị" showSearch={{ optionFilterProp: 'label' }} options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
          </Form.Item>
          <Form.Item label="Vai trò" name="role" rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Alert type="info" showIcon title="Hệ thống tự sinh mật khẩu tạm và chỉ hiện một lần sau khi tạo." />
        </Form>
      </Modal>
    </>
  );
}
