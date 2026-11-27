import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Spin, Steps } from 'antd';
import dayjs from 'dayjs';
import { apiBlob, isApiPending } from './api';
import { STEP_STATUS } from './constants';

// Khoảng thời gian dạng "08:00 09/11/2026 đến 10:00".
export const fmtRange = (startAt, endAt) => `${dayjs(startAt).format('HH:mm DD/MM/YYYY')} đến ${dayjs(endAt).format('HH:mm')}`;

// Hiện lỗi nghiệp vụ khi gửi hoặc duyệt yêu cầu. ROOM_CONFLICT kèm nguồn xung đột để người dùng biết đổi giờ hay đổi phòng.
export function ConflictAlert({ error }) {
  const extra = (error.details || []).map((d, i) => (
    <li key={i}>{d.source === 'CLASS_SCHEDULE' ? `Lớp ${d.courseCode} (${d.classCode}) trong thời khóa biểu` : `Lượt đặt đã duyệt ${d.requestCode}`}</li>
  ));
  return <Alert type="error" showIcon style={{ marginBottom: 16 }} title={error.message} description={extra.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{extra}</ul> : null} />;
}

const STEP_STATE = { APPROVED: 'finish', PENDING: 'process', REJECTED: 'error', WAITING: 'wait', CANCELLED: 'wait' };

// Tiến độ duyệt theo từng đơn vị. Phiếu chưa gửi chưa có bước nào.
export function StepsView({ steps }) {
  if (!steps.length) return <p className="note">Yêu cầu chưa được gửi nên chưa có bước duyệt.</p>;
  const at = steps.findIndex((s) => s.status === 'PENDING' || s.status === 'REJECTED');
  return (
    <Steps
      orientation="vertical"
      size="small"
      current={at === -1 ? steps.length : at}
      items={steps.map((s) => ({
        title: s.organizationName,
        status: STEP_STATE[s.status],
        // SCRUM-32: kèm thời điểm quyết định và lý do (bắt buộc khi từ chối, ghi chú khi đồng ý).
        content: [STEP_STATUS[s.status][1] + (s.decidedAt ? ` lúc ${dayjs(s.decidedAt).format('HH:mm DD/MM/YYYY')}` : ''), s.decisionReason && `Lý do: ${s.decisionReason}`].filter(Boolean).join('. '),
      }))}
    />
  );
}

// Tên đơn vị đang xử lý phiếu, hoặc chuỗi rỗng khi không còn bước nào chờ.
export const pendingOrg = (steps) => steps.find((s) => s.status === 'PENDING')?.organizationName || '';

// Chức năng đã có giao diện nhưng máy chủ chưa có API: báo rõ thay vì hiện lỗi 404.
export function PendingApi({ what, jira }) {
  return (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
      title={`Chức năng ${what} chưa có API ở máy chủ`}
      description={`Giao diện đã sẵn sàng theo API Contract. Khi backend hoàn thành${jira ? ` (${jira})` : ''}, trang này tự dùng dữ liệu thật mà không cần sửa giao diện.`}
    />
  );
}

// Ảnh mã QR của phòng hoặc thiết bị, tải từ API kèm token. In ra để dán tại phòng hoặc lên thiết bị (FR-05).
export function QrModal({ target, onClose }) {
  const [state, setState] = useState({ url: null, error: null });
  useEffect(() => {
    // Đóng hộp thoại thì bỏ ảnh cũ, để lần sau không vẽ ảnh của đối tượng trước.
    if (!target) {
      setState({ url: null, error: null });
      return undefined;
    }
    let url = null;
    let ignore = false;
    setState({ url: null, error: null });
    apiBlob(target.path)
      .then((blob) => {
        if (ignore) return;
        url = URL.createObjectURL(blob);
        setState({ url, error: null });
      })
      .catch((error) => { if (!ignore) setState({ url: null, error }); });
    return () => {
      ignore = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [target]);

  // In riêng tem QR trong một cửa sổ mới, không in cả trang.
  const print = () => {
    const w = window.open('', '_blank', 'width=420,height=520');
    if (!w) return;
    const doc = w.document;
    doc.title = `QR ${target.label}`;
    const box = doc.createElement('div');
    box.style.cssText = 'font-family:sans-serif;text-align:center;padding:24px';
    const img = doc.createElement('img');
    img.src = state.url;
    img.style.cssText = 'width:280px;height:280px';
    const cap = doc.createElement('p');
    cap.textContent = target.label;
    cap.style.cssText = 'font-size:18px;font-weight:700;margin:12px 0 0';
    box.append(img, cap);
    doc.body.append(box);
    img.onload = () => { w.focus(); w.print(); };
  };

  return (
    <Modal title={target ? `Mã QR ${target.label}` : ''} open={Boolean(target)} onCancel={onClose} destroyOnHidden
      footer={[<Button key="close" onClick={onClose}>Đóng</Button>, <Button key="print" type="primary" disabled={!state.url} onClick={print}>In mã QR</Button>]}>
      {state.error && (isApiPending(state.error) ? <PendingApi what="mã QR" jira="SCRUM-10" /> : <Alert type="error" showIcon title={state.error.message} />)}
      {!state.error && !state.url && <Spin />}
      {target && state.url && <img className="qr-image" src={state.url} alt={`Mã QR ${target.label}`} />}
    </Modal>
  );
}
