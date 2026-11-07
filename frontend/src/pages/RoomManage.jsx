import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Table, Tag, message } from 'antd';
import { api } from '../api';
import { CAMPUSES, EQUIPMENT, ROOM_STATUS, ROOM_TYPE } from '../constants';

const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label: Array.isArray(label) ? label[1] : label }));

// WF-08: quản lý phòng (FR-03). Không có nút xóa: phòng đã từng có lịch thì chỉ chuyển sang Ngừng sử dụng hoặc Bảo trì.
export default function RoomManage() {
  const [filter, setFilter] = useState({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null: đóng, {}: thêm mới, phòng: sửa
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    const p = new URLSearchParams({ page, pageSize: 10 });
    Object.entries(filter).forEach(([k, v]) => v && p.set(k, v));
    setLoading(true);
    api(`/rooms?${p}`)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter, page]);
  useEffect(load, [load]);

  const setF = (key) => (value) => { setPage(1); setFilter((f) => ({ ...f, [key]: value })); };

  const open = (room) => {
    form.resetFields();
    form.setFieldsValue(room.id ? room : { status: 'AVAILABLE', roomType: 'CLASSROOM' });
    setEditing(room);
  };
  const save = async (values) => {
    setSaving(true);
    try {
      if (editing.id) await api(`/rooms/${editing.id}`, { method: 'PATCH', body: values });
      else await api('/rooms', { method: 'POST', body: values });
      message.success(editing.id ? 'Đã cập nhật phòng' : 'Đã thêm phòng');
      setEditing(null);
      load();
    } catch (err) {
      const fields = (err.details || []).filter((d) => d.field).map((d) => ({ name: d.field, errors: [d.message] }));
      if (fields.length) form.setFields(fields);
      else message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="app-band">
        <h1>Quản lý phòng</h1>
        <p>Thêm phòng, sửa thông tin và đổi trạng thái. Phòng ở trạng thái Bảo trì hoặc Ngừng sử dụng sẽ không xuất hiện trong kết quả tra cứu.</p>
      </section>
      <div className="app-content">
        <div className="panel">
          <h2>Danh sách phòng</h2>
          <div className="form-row">
            <Input.Search size="large" allowClear placeholder="Tìm theo mã hoặc tên phòng" onSearch={setF('q')} />
            <Select size="large" allowClear placeholder="Mọi cơ sở" onChange={setF('campus')} options={CAMPUSES.map((c) => ({ value: c, label: c }))} />
            <Select size="large" allowClear placeholder="Mọi loại phòng" onChange={setF('roomType')} options={options(ROOM_TYPE)} />
            <Select size="large" allowClear placeholder="Mọi trạng thái" onChange={setF('status')} options={options(ROOM_STATUS)} />
            <Button type="primary" size="large" style={{ flex: '0 0 auto' }} onClick={() => open({})}>Thêm phòng</Button>
          </div>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            dataSource={data.items}
            scroll={{ x: 820 }}
            pagination={{ current: page, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: setPage }}
            columns={[
              { title: 'Mã phòng', dataIndex: 'code', width: 100, render: (v) => <b>{v}</b> },
              { title: 'Tên phòng', dataIndex: 'name' },
              { title: 'Tòa', dataIndex: 'building', width: 80 },
              { title: 'Cơ sở', dataIndex: 'campus', width: 100 },
              { title: 'Loại', dataIndex: 'roomType', width: 110, render: (v) => ROOM_TYPE[v] },
              { title: 'Sức chứa', dataIndex: 'capacity', width: 90, align: 'right' },
              { title: 'Thiết bị', dataIndex: 'equipment', render: (eq) => Object.entries(eq).map(([t, n]) => <Tag key={t}>{EQUIPMENT[t] || t} x{n}</Tag>) },
              { title: 'Trạng thái', dataIndex: 'status', width: 130, render: (v) => <Tag color={ROOM_STATUS[v][0]}>{ROOM_STATUS[v][1]}</Tag> },
              { title: '', width: 70, render: (_, room) => <Button type="link" size="small" onClick={() => open(room)}>Sửa</Button> },
            ]}
          />
          <p className="note">Thiết bị trong phòng được quản lý ở mục Quản lý thiết bị (Sprint 3).</p>
        </div>
      </div>

      <Modal title={editing?.id ? `Sửa phòng ${editing.code}` : 'Thêm phòng'} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={save}>
          <div className="form-row">
            <Form.Item label="Mã phòng" name="code" rules={[{ required: true, message: 'Nhập mã phòng' }, { max: 20, message: 'Tối đa 20 ký tự' }]} extra={editing?.id ? 'Không đổi mã phòng đã có lịch sử dụng.' : null}>
              <Input placeholder="A.10.01" disabled={Boolean(editing?.id)} />
            </Form.Item>
            <Form.Item label="Sức chứa" name="capacity" rules={[{ required: true, message: 'Nhập sức chứa' }]}>
              <InputNumber min={1} max={2000} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item label="Tên phòng" name="name" rules={[{ required: true, message: 'Nhập tên phòng' }, { max: 100, message: 'Tối đa 100 ký tự' }]}>
            <Input placeholder="Phòng A.10.01" />
          </Form.Item>
          <div className="form-row">
            <Form.Item label="Cơ sở" name="campus" rules={[{ required: true, message: 'Chọn cơ sở' }]}>
              <Select options={CAMPUSES.map((c) => ({ value: c, label: c }))} placeholder="Chọn cơ sở" disabled={Boolean(editing?.id)} />
            </Form.Item>
            <Form.Item label="Loại phòng" name="roomType" rules={[{ required: true, message: 'Chọn loại phòng' }]}>
              <Select options={options(ROOM_TYPE)} />
            </Form.Item>
          </div>
          <Form.Item label="Trạng thái" name="status" rules={[{ required: true, message: 'Chọn trạng thái' }]}>
            <Select options={options(ROOM_STATUS)} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
