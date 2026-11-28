import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Form, Input, Modal, Select, Tag, Upload, message } from 'antd';
import dayjs from 'dayjs';
import { api, isApiPending } from '../api';
import { PendingApi } from '../components';
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE } from '../constants';

const at = (v) => (v ? dayjs(v).format('HH:mm DD/MM/YYYY') : null);
// Danh sách thiết bị trong biên bản bàn giao, nhận trả (FR-17): mã tài sản kèm tình trạng lúc đó.
const items = (list) => list.map((e) => <Tag key={e.assetCode} color={EQUIPMENT_STATUS[e.status]?.[0]}>{e.assetCode} · {EQUIPMENT_STATUS[e.status]?.[1] || e.status}</Tag>);

// Quét mã QR bằng camera qua BarcodeDetector có sẵn của trình duyệt. Trình duyệt không hỗ trợ thì người dùng nhập mã.
function QrScanner({ open, onResult, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState(null);
  // Giữ hàm nhận kết quả trong ref để camera không bị mở lại mỗi lần trang cha vẽ lại.
  const done = useRef(onResult);
  done.current = onResult;
  useEffect(() => {
    if (!open) return undefined;
    let stream;
    let timer;
    let stopped = false;
    setError(null);
    (async () => {
      try {
        if (!('BarcodeDetector' in window)) throw new Error('Trình duyệt này chưa hỗ trợ quét QR. Hãy nhập mã in dưới hình QR.');
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = setInterval(async () => {
          const [code] = await detector.detect(video.current).catch(() => []);
          if (code && !stopped) {
            stopped = true;
            done.current(code.rawValue);
          }
        }, 300);
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? 'Chưa được cấp quyền dùng camera.' : e.message);
      }
    })();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);
  return (
    <Modal title="Quét mã QR của phòng" open={open} onCancel={onClose} footer={<Button onClick={onClose}>Đóng</Button>} destroyOnHidden>
      {error ? <Alert type="warning" showIcon title={error} /> : <video ref={video} className="qr-video" muted playsInline />}
    </Modal>
  );
}

// Báo hỏng thiết bị trong phòng đang sử dụng (FR-19): chọn thiết bị, mô tả, ảnh minh chứng tùy chọn.
function IncidentModal({ r, open, onClose }) {
  const [form] = Form.useForm();
  const [items, setItems] = useState(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setFiles([]);
    form.resetFields();
    api(`/rooms/${r.room.id}`)
      .then((d) => setItems(d.room.equipmentItems || []))
      .catch(() => setItems([]));
  }, [open, r, form]);

  const send = async (v) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('requestId', r.id);
      fd.append('equipmentId', v.equipmentId);
      fd.append('description', v.description);
      if (files[0]) fd.append('image', files[0].originFileObj);
      await api('/incidents', { method: 'POST', body: fd });
      message.success('Đã gửi báo hỏng, nhân viên cơ sở vật chất sẽ xử lý');
      onClose();
    } catch (err) {
      const fields = (err.details || []).filter((d) => d.field && d.field !== 'requestId').map((d) => ({ name: d.field, errors: [d.message] }));
      if (fields.length) form.setFields(fields);
      else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Báo hỏng thiết bị phòng ${r.room.code}`} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Gửi báo hỏng" cancelText="Hủy" confirmLoading={busy} destroyOnHidden>
      {error && (isApiPending(error) ? <PendingApi what="báo hỏng thiết bị" jira="SCRUM-24" /> : <Alert type="error" showIcon title={error.message} style={{ marginBottom: 12 }} />)}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={send}>
        <Form.Item label="Thiết bị" name="equipmentId" rules={[{ required: true, message: 'Chọn thiết bị bị hỏng' }]} extra={items && !items.length ? 'Chưa tải được danh sách thiết bị của phòng.' : null}>
          <Select
            loading={items === null}
            placeholder="Chọn thiết bị"
            options={(items || []).map((e) => ({ value: e.id, label: `${e.assetCode} · ${e.name} (${EQUIPMENT_TYPE[e.equipmentType] || e.equipmentType}, ${EQUIPMENT_STATUS[e.status]?.[1] || e.status})` }))}
          />
        </Form.Item>
        <Form.Item label="Mô tả sự cố" name="description" rules={[{ required: true, message: 'Mô tả tình trạng hỏng' }, { max: 1000, message: 'Tối đa 1000 ký tự' }]}>
          <Input.TextArea rows={3} placeholder="Máy chiếu không lên hình, micro bị rè..." />
        </Form.Item>
        <Form.Item label="Ảnh minh chứng (không bắt buộc)">
          <Upload maxCount={1} accept=".png,.jpg,.jpeg" fileList={files} beforeUpload={() => false} onChange={({ fileList }) => setFiles(fileList)}>
            <Button>Chọn ảnh</Button>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Khối Sử dụng phòng trên trang chi tiết yêu cầu đã duyệt (WF-11): trạng thái bàn giao, check-in và báo hỏng.
export default function RequestUsage({ r, owner, onChange }) {
  const [token, setToken] = useState('');
  const [scanning, setScanning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (r.status !== 'APPROVED') return null;

  const checkin = async (qrToken) => {
    if (!qrToken.trim()) return setError({ message: 'Quét hoặc nhập mã QR dán tại phòng.' });
    setBusy(true);
    setError(null);
    try {
      onChange((await api(`/requests/${r.id}/checkin`, { method: 'POST', body: { qrToken: qrToken.trim() } })).request);
      message.success('Check-in thành công');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const h = r.handover;
  return (
    <div className="panel no-print">
      <h2>Sử dụng phòng</h2>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Bàn giao">{h ? `${at(h.handedOverAt)}${h.handedOverBy ? `, ${h.handedOverBy}` : ''}${h.conditionNote ? `. ${h.conditionNote}` : ''}` : 'Chưa bàn giao'}</Descriptions.Item>
        {h?.items?.length > 0 && <Descriptions.Item label="Thiết bị lúc bàn giao">{items(h.items)}</Descriptions.Item>}
        <Descriptions.Item label="Nhận trả">{h?.returnedAt ? `${at(h.returnedAt)}${h.returnedBy ? `, ${h.returnedBy}` : ''}${h.returnNote ? `. ${h.returnNote}` : ''}` : 'Chưa nhận trả'}</Descriptions.Item>
        {h?.returnItems?.length > 0 && <Descriptions.Item label="Thiết bị lúc nhận trả">{items(h.returnItems)}</Descriptions.Item>}
        <Descriptions.Item label="Check-in">{r.checkin ? `Đã check-in lúc ${at(r.checkin.checkedInAt)}` : 'Chưa check-in'}</Descriptions.Item>
      </Descriptions>
      {owner && (
        <>
          {error && (isApiPending(error) ? <PendingApi what="check-in bằng QR" jira="SCRUM-23" /> : <Alert type="error" showIcon title={error.message} style={{ margin: '12px 0' }} />)}
          {!r.checkin && (
            <div className="form-row" style={{ marginTop: 12 }}>
              <Input size="large" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Mã QR dán tại phòng" aria-label="Mã QR phòng" onPressEnter={() => checkin(token)} />
              <Button size="large" style={{ flex: '0 0 auto' }} onClick={() => setScanning(true)}>Quét QR</Button>
              <Button size="large" type="primary" style={{ flex: '0 0 auto' }} loading={busy} onClick={() => checkin(token)}>Xác nhận check-in</Button>
            </div>
          )}
          <p className="note">Chỉ check-in được đúng phòng và trong khung giờ đã duyệt. Thiết bị có sự cố trong lúc sử dụng thì báo hỏng để nhân viên cơ sở vật chất xử lý.</p>
          <Button onClick={() => setReporting(true)}>Báo hỏng thiết bị</Button>
          <QrScanner open={scanning} onClose={() => setScanning(false)} onResult={(v) => { setScanning(false); setToken(v); checkin(v); }} />
          <IncidentModal r={r} open={reporting} onClose={() => setReporting(false)} />
        </>
      )}
    </div>
  );
}
