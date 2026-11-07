import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Checkbox, DatePicker, Empty, Form, InputNumber, Select, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api';
import { useAuth } from '../auth';
import { CAMPUSES, EQUIPMENT, ROOM_TYPE } from '../constants';

const PICKABLE = ['MICROPHONE', 'PROJECTOR', 'AUDIO', 'AIR_CONDITIONER'];

// Mỗi loại thiết bị là một ô chọn kèm số lượng, kết quả gửi lên dạng MICROPHONE:2,PROJECTOR:1 theo API Contract.
function EquipmentPicker({ value = {}, onChange }) {
  const set = (type, qty) => {
    const next = { ...value };
    if (qty) next[type] = qty;
    else delete next[type];
    onChange(next);
  };
  return (
    <div className="equip-grid">
      {PICKABLE.map((type) => (
        <div key={type} className="equip-item">
          <Checkbox checked={Boolean(value[type])} onChange={(e) => set(type, e.target.checked ? 1 : 0)}>
            {EQUIPMENT[type]}
          </Checkbox>
          {value[type] ? <InputNumber size="small" min={1} max={20} value={value[type]} onChange={(n) => set(type, n || 1)} aria-label={`Số lượng ${EQUIPMENT[type]}`} /> : null}
        </div>
      ))}
    </div>
  );
}

const columns = (onPick) => [

  { title: 'Mã phòng', dataIndex: 'code', width: 110, render: (v) => <b>{v}</b> },
  { title: 'Cơ sở', dataIndex: 'campus', width: 100 },
  { title: 'Loại', dataIndex: 'roomType', width: 110, render: (v) => ROOM_TYPE[v] },
  { title: 'Sức chứa', dataIndex: 'capacity', width: 90, align: 'right' },
  {
    title: 'Thiết bị sẵn có',
    dataIndex: 'equipment',
    render: (eq) => Object.entries(eq).map(([t, n]) => <Tag key={t}>{EQUIPMENT[t] || t} x{n}</Tag>),
  },
  { title: 'Trạng thái', width: 110, render: () => <Tag color="green">Còn trống</Tag> },
  ...(onPick ? [{ title: '', width: 90, render: (_, room) => <Button type="primary" size="small" onClick={() => onPick(room)}>Chọn</Button> }] : []),
];

// WF-02: tra cứu phòng trống theo phiếu đề xuất (FR-06). Máy chủ lọc và phân trang, giao diện chỉ gửi điều kiện và hiện kết quả.
export default function RoomSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [state, setState] = useState({ loading: false, error: null, data: null, query: null });

  const search = async (values, page = 1) => {
    const [from, to] = values.range;
    const params = new URLSearchParams({ from: from.format(), to: to.format(), capacity: values.capacity, page, pageSize: 10 });
    if (values.campus) params.set('campus', values.campus);
    if (values.roomType) params.set('roomType', values.roomType);
    const eq = Object.entries(values.equipment || {}).map(([t, n]) => `${t}:${n}`).join(',');
    if (eq) params.set('equipment', eq);
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(`/rooms/available?${params}`);
      setState({ loading: false, error: null, data, query: { values, page } });
    } catch (err) {
      const fields = (err.details || []).filter((d) => d.field).map((d) => ({ name: d.field === 'from' || d.field === 'to' ? 'range' : d.field, errors: [d.message] }));
      if (fields.length) form.setFields(fields);
      setState({ loading: false, error: fields.length ? null : err.message, data: null, query: null });
    }
  };

  const pick = (room) => {
    const { range, capacity } = state.query.values;
    navigate('/requests/new', { state: { roomId: room.id, startAt: range[0].format(), endAt: range[1].format(), participantCount: capacity } });
  };

  const rangeRule = {
    validator: (_, v) => {
      if (!v) return Promise.reject(new Error('Chọn khung giờ sử dụng'));
      const [a, b] = v;
      if (!b.isAfter(a) || !b.isSame(a, 'day')) return Promise.reject(new Error('Giờ kết thúc phải sau giờ bắt đầu và trong cùng ngày'));
      if (b.hour() * 60 + b.minute() > 21 * 60 + 30) return Promise.reject(new Error('Giờ kết thúc không muộn hơn 21:30'));
      return Promise.resolve();
    },
  };

  return (
    <>
      <section className="app-band">
        <h1>Tra cứu phòng trống</h1>
        <p>Chọn khung giờ và số người để xem phòng còn trống, không trùng lịch học chính khóa hay lượt đặt đã duyệt.</p>
      </section>
      <div className="app-content">
        <div className="panel">
          <h2>Điều kiện sử dụng</h2>
          <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => search(v)} initialValues={{ equipment: {} }}>
            <div className="form-row">
              <Form.Item label="Khung giờ sử dụng" name="range" rules={[rangeRule]} className="grow2">
                <DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="DD/MM/YYYY HH:mm" size="large" style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item label="Số người tham dự" name="capacity" rules={[{ required: true, message: 'Nhập số người' }]}>
                <InputNumber min={1} max={1000} size="large" style={{ width: '100%' }} placeholder="80" />
              </Form.Item>
              <Form.Item label="Cơ sở" name="campus">
                <Select size="large" allowClear placeholder="Tất cả" options={CAMPUSES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
              <Form.Item label="Loại phòng" name="roomType">
                <Select size="large" allowClear placeholder="Tất cả" options={Object.entries(ROOM_TYPE).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </div>
            <Form.Item label="Thiết bị cần có" name="equipment">
              <EquipmentPicker />
            </Form.Item>
            <div className="form-actions">
              <Button onClick={() => { form.resetFields(); setState({ loading: false, error: null, data: null, query: null }); }}>Xóa lọc</Button>
              <Button type="primary" htmlType="submit" loading={state.loading}>Tìm phòng</Button>
            </div>
          </Form>
        </div>

        {state.error && <Alert type="error" showIcon title={state.error} style={{ marginTop: 16 }} />}
        {state.data && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Phòng gợi ý ({state.data.total})</h2>
            <Table
              rowKey="id"
              size="middle"
              columns={columns(user.role === 'REQUESTER' ? pick : null)}
              dataSource={state.data.items}
              scroll={{ x: 760 }}
              locale={{ emptyText: <Empty description="Không có phòng nào thỏa điều kiện. Thử đổi khung giờ hoặc giảm bớt thiết bị." /> }}
              pagination={{ current: state.data.page, pageSize: state.data.pageSize, total: state.data.total, showSizeChanger: false, onChange: (p) => search(state.query.values, p) }}
            />
            {user.role === 'REQUESTER' ? <p className="note">Bấm Chọn để lập phiếu đề xuất với phòng và khung giờ này.</p> : <p className="note">Chỉ tài khoản Người đăng ký mới lập được phiếu đề xuất.</p>}
          </div>
        )}
      </div>
    </>
  );
}
