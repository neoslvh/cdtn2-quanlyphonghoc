import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select, Table, Tag, message } from 'antd';
import { api, isApiPending } from '../api';
import { PendingApi, QrModal } from '../components';
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE } from '../constants';

const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label: Array.isArray(label) ? label[1] : label }));

// WF-09: quản lý thiết bị (FR-04, FR-05, SCRUM-9, SCRUM-10). Thiết bị Hỏng hoặc Đang bảo trì không được tính là
// tài nguyên khả dụng khi tra cứu phòng và lập phiếu (BR-08). Mỗi thiết bị có mã QR riêng để dán lên thiết bị.
export default function Equipment() {
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null: đóng, {}: thêm mới, thiết bị: sửa
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState(null);
  const [form] = Form.useForm();
  const latest = useRef(0);

  useEffect(() => {
    api('/rooms').then((d) => setRooms(d.items)).catch(() => {});
  }, []);
  const load = useCallback(() => {
    const mine = ++latest.current;
    const p = new URLSearchParams({ page, pageSize: 20 });
    Object.entries(filter).forEach(([k, v]) => v && p.set(k, v));
    setLoading(true);
    api(`/equipment?${p}`)
      .then((d) => { if (mine === latest.current) { setData(d); setError(null); } })
      .catch((e) => { if (mine === latest.current) setError(e); })
      .finally(() => { if (mine === latest.current) setLoading(false); });
  }, [filter, page]);
  useEffect(load, [load]);

  const setF = (key) => (value) => { setPage(1); setFilter((f) => ({ ...f, [key]: value || undefined })); };
  const open = (e) => {
    form.resetFields();
    form.setFieldsValue(e.id ? { ...e, roomId: e.room?.id } : { status: 'GOOD', roomId: filter.roomId });
    setEditing(e);
  };
  const save = async (values) => {
    setSaving(true);
    try {
      const body = { ...values, roomId: values.roomId || null };
      if (editing.id) await api(`/equipment/${editing.id}`, { method: 'PATCH', body });
      else await api('/equipment', { method: 'POST', body });
      message.success(editing.id ? 'Đã cập nhật thiết bị' : 'Đã thêm thiết bị');
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

  const roomOptions = rooms.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }));
  const pending = isApiPending(error);

  return (
    <>
      <section className="app-band">
        <h1>Quản lý thiết bị</h1>
        <p>Thêm, sửa thiết bị theo phòng, đổi tình trạng và in mã QR. Thiết bị hỏng hoặc đang bảo trì không được tính là thiết bị khả dụng khi lập phiếu.</p>
      </section>
      <div className="app-content">
        {pending && <PendingApi what="quản lý thiết bị" jira="SCRUM-9" />}
        <div className="panel">
          <h2>Danh sách thiết bị</h2>
          <div className="form-row">
            <Input.Search size="large" allowClear placeholder="Tìm theo mã tài sản hoặc tên" aria-label="Tìm thiết bị" onSearch={setF('q')} />
            <Select size="large" allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Mọi phòng" aria-label="Lọc theo phòng" onChange={setF('roomId')} options={roomOptions} />
            <Select size="large" allowClear placeholder="Mọi loại" aria-label="Lọc theo loại" onChange={setF('equipmentType')} options={options(EQUIPMENT_TYPE)} />
            <Select size="large" allowClear placeholder="Mọi tình trạng" aria-label="Lọc theo tình trạng" onChange={setF('status')} options={options(EQUIPMENT_STATUS)} />
            <Button type="primary" size="large" style={{ flex: '0 0 auto' }} disabled={pending} onClick={() => open({})}>Thêm thiết bị</Button>
          </div>
          {error && !pending && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 12 }} />}
          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            dataSource={data.items}
            scroll={{ x: 820 }}
            locale={{ emptyText: pending ? 'Chưa có dữ liệu thiết bị' : 'Không có thiết bị nào' }}
            pagination={{ current: page, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: setPage }}
            columns={[
              { title: 'Mã tài sản', dataIndex: 'assetCode', width: 150, render: (v) => <b>{v}</b> },
              { title: 'Tên thiết bị', dataIndex: 'name' },
              { title: 'Loại', dataIndex: 'equipmentType', width: 110, render: (v) => EQUIPMENT_TYPE[v] || v },
              { title: 'Phòng', dataIndex: ['room', 'code'], width: 100, render: (v) => v || 'Kho' },
              { title: 'Tình trạng', dataIndex: 'status', width: 130, render: (v) => <Tag color={EQUIPMENT_STATUS[v]?.[0]}>{EQUIPMENT_STATUS[v]?.[1] || v}</Tag> },
              {
                title: '',
                width: 150,
                render: (_, e) => (
                  <>
                    <Button type="link" size="small" onClick={() => setQr({ path: `/equipment/${e.id}/qr`, label: e.assetCode })}>Xem QR</Button>
                    <Button type="link" size="small" onClick={() => open(e)}>Sửa</Button>
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>

      <Modal title={editing?.id ? `Sửa thiết bị ${editing.assetCode}` : 'Thêm thiết bị'} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={save}>
          <div className="form-row">
            <Form.Item label="Mã tài sản" name="assetCode" rules={[{ required: true, message: 'Nhập mã tài sản' }, { max: 50, message: 'Tối đa 50 ký tự' }]}>
              <Input placeholder="PJ-A1001-1" />
            </Form.Item>
            <Form.Item label="Loại" name="equipmentType" rules={[{ required: true, message: 'Chọn loại thiết bị' }]}>
              <Select placeholder="Chọn loại" options={options(EQUIPMENT_TYPE)} />
            </Form.Item>
          </div>
          <Form.Item label="Tên thiết bị" name="name" rules={[{ required: true, message: 'Nhập tên thiết bị' }, { max: 150, message: 'Tối đa 150 ký tự' }]}>
            <Input placeholder="Máy chiếu Epson X1" />
          </Form.Item>
          <div className="form-row">
            <Form.Item label="Phòng" name="roomId" extra="Bỏ trống nếu thiết bị đang ở kho.">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Chọn phòng" options={roomOptions} />
            </Form.Item>
            <Form.Item label="Tình trạng" name="status" rules={[{ required: true, message: 'Chọn tình trạng' }]}>
              <Select options={options(EQUIPMENT_STATUS)} />
            </Form.Item>
          </div>
          <p className="note">Mã QR được hệ thống tạo tự động khi thêm thiết bị.</p>
        </Form>
      </Modal>
      <QrModal target={qr} onClose={() => setQr(null)} />
    </>
  );
}
