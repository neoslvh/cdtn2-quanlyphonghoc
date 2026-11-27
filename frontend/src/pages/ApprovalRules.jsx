import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Switch, Table, TimePicker, message } from 'antd';
import dayjs from 'dayjs';
import { api, isApiPending } from '../api';
import { PendingApi } from '../components';

// Điều kiện của quy tắc dạng chữ: "07:00 đến 18:00, từ 200 người".
const describe = (c = {}) => [
  c.timeFrom || c.timeTo ? `${c.timeFrom || '00:00'} đến ${c.timeTo || '23:59'}` : null,
  c.minParticipants ? `từ ${c.minParticipants} người` : null,
].filter(Boolean).join(', ');

// Quy tắc duyệt (FR-16, SCRUM-21): điều kiện nào thì phiếu chuyển tới đơn vị nào, theo BR-03 đến BR-06.
// Quản trị viên thêm, sửa, bật tắt quy tắc; máy chủ dùng các quy tắc đang bật để sinh chuỗi duyệt khi gửi phiếu.
export default function ApprovalRules() {
  const [items, setItems] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    setLoading(true);
    api('/approval-rules')
      .then((d) => { setItems(d.items); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api('/organizations?scope=all').then((d) => setOrgs(d.items.filter((o) => o.type !== 'REQUESTER_UNIT'))).catch(() => {});
  }, []);

  const open = (rule) => {
    form.resetFields();
    const c = rule.condition || {};
    form.setFieldsValue(rule.id
      ? { code: rule.code, name: rule.name, priority: rule.priority, targetOrgId: rule.targetOrg.id || orgs.find((o) => o.name === rule.targetOrg.name)?.id, active: rule.active, time: c.timeFrom || c.timeTo ? [dayjs(c.timeFrom || '00:00', 'HH:mm'), dayjs(c.timeTo || '23:59', 'HH:mm')] : null, minParticipants: c.minParticipants }
      : { priority: (Math.max(0, ...items.map((x) => x.priority)) || 0) + 10, active: true });
    setEditing(rule);
  };
  const save = async (v) => {
    setSaving(true);
    try {
      const body = {
        code: v.code,
        name: v.name,
        priority: v.priority,
        active: v.active,
        targetOrgId: v.targetOrgId,
        targetOrgName: orgs.find((o) => o.id === v.targetOrgId)?.name,
        condition: { timeFrom: v.time?.[0]?.format('HH:mm'), timeTo: v.time?.[1]?.format('HH:mm'), minParticipants: v.minParticipants || undefined },
      };
      if (editing.id) await api(`/approval-rules/${editing.id}`, { method: 'PATCH', body });
      else await api('/approval-rules', { method: 'POST', body });
      message.success(editing.id ? 'Đã cập nhật quy tắc' : 'Đã thêm quy tắc');
      setEditing(null);
      load();
    } catch (err) {
      const fields = (err.details || []).filter((d) => d.field).map((d) => ({ name: d.field === 'condition' ? 'time' : d.field, errors: [d.message] }));
      if (fields.length) form.setFields(fields);
      else message.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (rule, active) => {
    try {
      await api(`/approval-rules/${rule.id}`, { method: 'PATCH', body: { active } });
      load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const pending = isApiPending(error);
  return (
    <>
      <section className="app-band">
        <h1>Quy tắc duyệt</h1>
        <p>Phiếu thỏa điều kiện của quy tắc nào thì có thêm bước duyệt của đơn vị đó, xét theo thứ tự ưu tiên tăng dần.</p>
      </section>
      <div className="app-content">
        {pending && <PendingApi what="cấu hình quy tắc duyệt" jira="SCRUM-17, SCRUM-21" />}
        {error && !pending && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />}
        <div className="panel">
          <div className="form-row" style={{ alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Danh sách quy tắc</h2>
            <div style={{ flex: 1 }} />
            <Button type="primary" style={{ flex: '0 0 auto' }} disabled={pending} onClick={() => open({})}>Thêm quy tắc</Button>
          </div>
          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            dataSource={items}
            pagination={false}
            scroll={{ x: 820 }}
            style={{ marginTop: 12 }}
            locale={{ emptyText: pending ? 'Chưa có dữ liệu quy tắc' : 'Chưa có quy tắc nào' }}
            columns={[
              { title: 'Ưu tiên', dataIndex: 'priority', width: 80, align: 'right' },
              { title: 'Mã', dataIndex: 'code', width: 160, render: (v) => <b>{v}</b> },
              { title: 'Tên quy tắc', dataIndex: 'name' },
              { title: 'Điều kiện', dataIndex: 'condition', width: 150, render: describe },
              { title: 'Đơn vị xử lý', dataIndex: ['targetOrg', 'name'], width: 170 },
              { title: 'Bật', dataIndex: 'active', width: 70, render: (v, rule) => <Switch size="small" checked={v} onChange={(on) => toggle(rule, on)} aria-label={`Bật quy tắc ${rule.code}`} /> },
              { title: '', width: 70, render: (_, rule) => <Button type="link" size="small" onClick={() => open(rule)}>Sửa</Button> },
            ]}
          />
          <p className="note">Theo SRS: 07:00 đến 18:00 chuyển Phòng Đào tạo, sau 18:00 chuyển Trung tâm Hỗ trợ Sinh viên, từ 200 người cần Ban Giám hiệu phê duyệt. Phòng Quản trị cơ sở vật chất luôn là bước cuối để bố trí phòng.</p>
        </div>
      </div>

      <Modal title={editing?.id ? `Sửa quy tắc ${editing.code}` : 'Thêm quy tắc'} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={save}>
          <div className="form-row">
            <Form.Item label="Mã quy tắc" name="code" rules={[{ required: true, message: 'Nhập mã quy tắc' }, { pattern: /^[A-Z0-9_]{2,50}$/, message: 'Chữ in hoa, số và dấu gạch dưới' }]}>
              <Input placeholder="BGH_TU_200" />
            </Form.Item>
            <Form.Item label="Thứ tự ưu tiên" name="priority" rules={[{ required: true, message: 'Nhập thứ tự' }]}>
              <InputNumber min={1} max={1000} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item label="Tên quy tắc" name="name" rules={[{ required: true, message: 'Nhập tên quy tắc' }, { max: 150, message: 'Tối đa 150 ký tự' }]}>
            <Input placeholder="Từ 200 người cần Ban Giám hiệu phê duyệt" />
          </Form.Item>
          <Form.Item label="Đơn vị xử lý" name="targetOrgId" rules={[{ required: true, message: 'Chọn đơn vị xử lý' }]}>
            <Select placeholder="Chọn đơn vị" options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
          </Form.Item>
          <div className="form-row">
            <Form.Item label="Khung giờ áp dụng" name="time" className="grow2">
              <TimePicker.RangePicker format="HH:mm" minuteStep={15} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Từ số người" name="minParticipants">
              <InputNumber min={1} max={5000} style={{ width: '100%' }} placeholder="200" />
            </Form.Item>
          </div>
          <Form.Item label="Đang bật" name="active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <p className="note">Nhập ít nhất một điều kiện: khung giờ hoặc số người tối thiểu.</p>
        </Form>
      </Modal>
    </>
  );
}
