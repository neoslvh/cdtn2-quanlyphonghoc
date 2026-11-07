import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Result, Select, Steps, Tag, Upload, message } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api';
import { useAuth } from '../auth';
import { EQUIPMENT, REQUEST_STATUS } from '../constants';

// Hiện lỗi nghiệp vụ khi gửi yêu cầu. ROOM_CONFLICT kèm nguồn xung đột để người dùng biết đổi giờ hay đổi phòng.
function ConflictAlert({ error }) {
  const extra = (error.details || []).map((d, i) => (
    <li key={i}>{d.source === 'CLASS_SCHEDULE' ? `Lớp ${d.courseCode} (${d.classCode}) trong thời khóa biểu` : `Lượt đặt đã duyệt ${d.requestCode}`}</li>
  ));
  return <Alert type="error" showIcon style={{ marginBottom: 16 }} title={error.message} description={extra.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{extra}</ul> : null} />;
}

// WF-03: phiếu đề xuất sử dụng phòng (FR-07). Lưu nháp chỉ kiểm tra định dạng, gửi mới kiểm tra toàn bộ quy tắc ở máy chủ.
export default function RequestForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [form] = Form.useForm();
  const [orgs, setOrgs] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [files, setFiles] = useState([]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const watchedCount = Form.useWatch('participantCount', form);
  const roomId = Form.useWatch('roomId', form);

  useEffect(() => {
    api('/organizations').then((d) => setOrgs(d.items)).catch((e) => setError(e));
    api('/rooms').then((d) => setRooms(d.items)).catch((e) => setError(e));
  }, []);
  useEffect(() => {
    if (!orgs.length) return;
    form.setFieldValue('organizationId', orgs.find((o) => o.id === user.organization?.id)?.id);
  }, [orgs, form, user]);

  const initial = {
    roomId: state?.roomId,
    range: state?.startAt ? [dayjs(state.startAt), dayjs(state.endAt)] : undefined,
    participantCount: state?.participantCount,
    equipment: [],
  };
  const room = rooms.find((r) => r.id === roomId);

  const payload = (v) => ({
    organizationId: v.organizationId,
    roomId: v.roomId,
    purpose: v.purpose,
    startAt: v.range?.[0]?.format(),
    endAt: v.range?.[1]?.format(),
    participantCount: v.participantCount,
    equipment: (v.equipment || []).filter(Boolean).map(({ itemType, quantity, otherDescription }) => ({ itemType, quantity: quantity || 1, ...(itemType === 'OTHER' ? { otherDescription } : {}) })),
  });

  const showFieldErrors = (err) => {
    const map = { startAt: 'range', endAt: 'range' };
    const fields = (err.details || []).filter((d) => d.field).map((d) => ({ name: (map[d.field] || d.field).split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)), errors: [d.message] }));
    if (fields.length) form.setFields(fields);
    return fields.length > 0;
  };

  // Lưu bản nháp (tạo mới hoặc sửa), rồi tải các tệp đính kèm chưa tải lên.
  const save = async (values) => {
    const body = payload(values);
    const d = draft ? await api(`/requests/${draft.id}`, { method: 'PATCH', body }) : await api('/requests', { method: 'POST', body });
    let current = d.request;
    for (const f of files.filter((x) => !x.uploaded)) {
      const fd = new FormData();
      fd.append('file', f.originFileObj);
      current = (await api(`/requests/${current.id}/attachments`, { method: 'POST', body: fd })).request;
      f.uploaded = true;
    }
    setDraft(current);
    return current;
  };

  const run = async (action) => {
    setError(null);
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    try {
      const saved = await save(values);
      if (action === 'draft') {
        message.success(`Đã lưu nháp ${saved.code}`);
      } else {
        const d = await api(`/requests/${saved.id}/submit`, { method: 'POST' });
        setSent(d.request);
      }
    } catch (err) {
      if (!showFieldErrors(err)) setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    const [color, label] = REQUEST_STATUS[sent.status];
    return (
      <div className="app-content">
        <Result
          status="success"
          title={`Đã gửi yêu cầu ${sent.code}`}
          subTitle={<>Trạng thái: <Tag color={color}>{label}</Tag> Phòng {sent.room.code}, {dayjs(sent.startAt).format('HH:mm DD/MM/YYYY')} đến {dayjs(sent.endAt).format('HH:mm')}</>}
          extra={[
            <Button key="new" type="primary" onClick={() => navigate('/rooms/search')}>Tra cứu phòng khác</Button>,
          ]}
        />
        <div className="panel">
          <h2>Tiến độ duyệt</h2>
          <Steps
            orientation="vertical"
            current={0}
            items={sent.steps.map((s) => ({ title: s.organizationName, content: s.status === 'PENDING' ? 'Đang chờ xử lý' : 'Chưa tới lượt' }))}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="app-band">
        <h1>Phiếu đề xuất sử dụng phòng</h1>
        <p>Điền thông tin, lưu nháp để làm tiếp sau hoặc gửi để các đơn vị duyệt.</p>
      </section>
      <div className="app-content">
        {error && (error.code === 'ROOM_CONFLICT' ? <ConflictAlert error={error} /> : <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />)}
        <Form form={form} layout="vertical" requiredMark={false} initialValues={initial} disabled={busy}>
          <div className="panel">
            <h2>1. Thông tin chung</h2>
            <div className="form-row">
              <Form.Item label="Đơn vị đăng ký" name="organizationId" rules={[{ required: true, message: 'Chọn đơn vị' }]} className="grow2">
                <Select size="large" showSearch={{ optionFilterProp: 'label' }} placeholder="Chọn khoa hoặc phòng ban" options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
              </Form.Item>
              <Form.Item label="Người đề xuất">
                <Input size="large" value={user.fullName} readOnly />
              </Form.Item>
            </div>
            <div className="form-row">
              <Form.Item
                label="Thời gian sử dụng"
                name="range"
                className="grow2"
                rules={[{ required: true, message: 'Chọn thời gian' }, { validator: (_, v) => (!v || v[1].isSame(v[0], 'day') ? Promise.resolve() : Promise.reject(new Error('Bắt đầu và kết thúc phải cùng một ngày'))) }]}
              >
                <DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="DD/MM/YYYY HH:mm" size="large" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Số người tham dự" name="participantCount" rules={[{ required: true, message: 'Nhập số người' }]}>
                <InputNumber min={1} max={1000} size="large" style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Form.Item label="Mục đích sử dụng" name="purpose" rules={[{ required: true, message: 'Nhập mục đích' }, { max: 500, message: 'Tối đa 500 ký tự' }]}>
              <Input.TextArea rows={3} placeholder="Sinh hoạt chuyên đề, hội thảo, hoạt động của đơn vị..." />
            </Form.Item>
          </div>

          <div className="panel">
            <h2>2. Phòng</h2>
            <div className="form-row">
              <Form.Item label="Phòng đề xuất" name="roomId" rules={[{ required: true, message: 'Chọn phòng' }]} className="grow2">
                <Select size="large" showSearch={{ optionFilterProp: 'label' }} placeholder="Chọn phòng" options={rooms.map((r) => ({ value: r.id, label: `${r.code} · ${r.name} · ${r.capacity} chỗ`, disabled: r.status !== 'AVAILABLE' }))} />
              </Form.Item>
              <Form.Item label=" ">
                <Button size="large" onClick={() => navigate('/rooms/search')}>Tra cứu phòng trống</Button>
              </Form.Item>
            </div>
            {room && watchedCount > room.capacity ? <Alert type="warning" showIcon title={`Số người (${watchedCount}) vượt sức chứa của phòng ${room.code} (${room.capacity} chỗ).`} /> : null}
          </div>

          <div className="panel">
            <h2>3. Thiết bị đề xuất</h2>
            <Form.List name="equipment">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <div className="form-row" key={key}>
                      <Form.Item name={[name, 'itemType']} rules={[{ required: true, message: 'Chọn thiết bị' }]} className="grow2">
                        <Select size="large" placeholder="Loại thiết bị" options={Object.entries(EQUIPMENT).map(([value, label]) => ({ value, label }))} />
                      </Form.Item>
                      <Form.Item name={[name, 'quantity']} initialValue={1}>
                        <InputNumber min={1} max={50} size="large" style={{ width: 100 }} aria-label="Số lượng" />
                      </Form.Item>
                      <Form.Item noStyle shouldUpdate={(a, b) => a.equipment?.[name]?.itemType !== b.equipment?.[name]?.itemType}>
                        {({ getFieldValue }) =>
                          getFieldValue(['equipment', name, 'itemType']) === 'OTHER' ? (
                            <Form.Item name={[name, 'otherDescription']} rules={[{ required: true, message: 'Mô tả thiết bị' }]} className="grow2">
                              <Input size="large" placeholder="Mô tả thiết bị khác" />
                            </Form.Item>
                          ) : null
                        }
                      </Form.Item>
                      <Form.Item>
                        <Button size="large" onClick={() => remove(name)}>Xóa</Button>
                      </Form.Item>
                    </div>
                  ))}
                  <Button onClick={() => add({ quantity: 1 })}>Thêm thiết bị</Button>
                </>
              )}
            </Form.List>
          </div>

          <div className="panel">
            <h2>4. Tài liệu đính kèm</h2>
            <Upload
              multiple
              fileList={files}
              beforeUpload={() => false}
              onChange={({ fileList }) => setFiles(fileList)}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            >
              <Button>Chọn tệp</Button>
            </Upload>
            <p className="note">Hoạt động từ 200 người trở lên bắt buộc đính kèm văn bản phê duyệt của Ban Giám hiệu. Mỗi tệp tối đa 5 MB (PDF, Word hoặc ảnh).</p>
          </div>

          <div className="form-actions">
            <Button onClick={() => navigate('/')}>Hủy</Button>
            <Button onClick={() => run('draft')} loading={busy}>Lưu nháp</Button>
            <Button type="primary" onClick={() => run('submit')} loading={busy}>Gửi đề xuất</Button>
          </div>
        </Form>
      </div>
    </>
  );
}
