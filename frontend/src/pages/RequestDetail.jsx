import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Descriptions, Input, Modal, Spin, Tag, message } from 'antd';
import { api } from '../api';
import { ConflictAlert, StepsView, fmtRange } from '../components';
import { EQUIPMENT, REQUEST_STATUS } from '../constants';
import { useAuth } from '../auth';

// Chi tiết một yêu cầu: thông tin, tiến độ duyệt và các thao tác còn được phép theo trạng thái (FR-09, SCRUM-14, SCRUM-15).
// Nháp được sửa, gửi, hủy. Đang duyệt chỉ hủy được. Đã duyệt, từ chối hoặc đã hủy chỉ xem.
export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    api(`/requests/${id}`).then((d) => setR(d.request)).catch((e) => setError(e));
  }, [id]);
  useEffect(load, [load]);

  if (!r) {
    return (
      <div className="app-content">
        {error ? <Alert type="error" showIcon title={error.status === 404 ? 'Không tìm thấy yêu cầu.' : error.message} action={<Link to="/requests">Về danh sách</Link>} /> : <Spin />}
      </div>
    );
  }

  const owner = user.role === 'REQUESTER';
  const [color, label] = REQUEST_STATUS[r.status];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setR((await api(`/requests/${r.id}/submit`, { method: 'POST' })).request);
      message.success(`Đã gửi yêu cầu ${r.code}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      setR((await api(`/requests/${r.id}/cancel`, { method: 'POST', body: { reason: reason.trim() || undefined } })).request);
      setCancelling(false);
      setReason('');
      message.success(`Đã hủy yêu cầu ${r.code}`);
    } catch (err) {
      setCancelling(false);
      setError(err);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="app-band">
        <h1>Yêu cầu {r.code}</h1>
        <p><Tag color={color}>{label}</Tag> Phòng {r.room.code}, {fmtRange(r.startAt, r.endAt)}</p>
      </section>
      <div className="app-content">
        {error && (error.code === 'ROOM_CONFLICT' ? <ConflictAlert error={error} /> : <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />)}
        {r.cancelReason && <Alert type="warning" showIcon title={`Lý do hủy: ${r.cancelReason}`} style={{ marginBottom: 16 }} />}
        <div className="panel">
          <h2>Thông tin yêu cầu</h2>
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
            <Descriptions.Item label="Đơn vị đăng ký">{r.organizationName || '-'}</Descriptions.Item>
            <Descriptions.Item label="Người đề xuất">{r.requesterName}</Descriptions.Item>
            <Descriptions.Item label="Phòng">{r.room.code} · {r.room.name} · {r.room.capacity} chỗ</Descriptions.Item>
            <Descriptions.Item label="Số người tham dự">{r.participantCount}</Descriptions.Item>
            <Descriptions.Item label="Mục đích" span={2}>{r.purpose}</Descriptions.Item>
            <Descriptions.Item label="Thiết bị" span={2}>
              {r.equipment.length ? r.equipment.map((e) => <Tag key={e.itemType}>{EQUIPMENT[e.itemType]}{e.itemType === 'OTHER' ? `: ${e.otherDescription}` : ''} x{e.quantity}</Tag>) : 'Không đề xuất thiết bị'}
            </Descriptions.Item>
            <Descriptions.Item label="Tài liệu đính kèm" span={2}>{r.attachments.length ? r.attachments.map((a) => a.fileName).join(', ') : 'Không có'}</Descriptions.Item>
          </Descriptions>
        </div>
        <div className="panel">
          <h2>Tiến độ duyệt</h2>
          <StepsView steps={r.steps} />
        </div>
        <div className="form-actions">
          <Button onClick={() => navigate('/requests')}>Về danh sách</Button>
          {owner && r.status === 'DRAFT' && <Button onClick={() => navigate(`/requests/${r.id}/edit`)}>Sửa</Button>}
          {owner && ['DRAFT', 'PENDING'].includes(r.status) && <Button danger onClick={() => setCancelling(true)}>Hủy yêu cầu</Button>}
          {owner && r.status === 'DRAFT' && <Button type="primary" loading={busy} onClick={submit}>Gửi đề xuất</Button>}
        </div>
      </div>
      <Modal title={`Hủy yêu cầu ${r.code}`} open={cancelling} onCancel={() => setCancelling(false)} onOk={cancel} okText="Hủy yêu cầu" okButtonProps={{ danger: true }} cancelText="Quay lại" confirmLoading={busy} destroyOnHidden>
        <p>Yêu cầu sẽ chuyển sang Đã hủy và không khôi phục được.</p>
        <Input.TextArea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do hủy (không bắt buộc)" aria-label="Lý do hủy" />
      </Modal>
    </>
  );
}
