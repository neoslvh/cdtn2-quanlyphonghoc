import { Alert, Steps } from 'antd';
import dayjs from 'dayjs';
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
      items={steps.map((s) => ({ title: s.organizationName, status: STEP_STATE[s.status], content: STEP_STATUS[s.status][1] }))}
    />
  );
}

// Tên đơn vị đang xử lý phiếu, hoặc chuỗi rỗng khi không còn bước nào chờ.
export const pendingOrg = (steps) => steps.find((s) => s.status === 'PENDING')?.organizationName || '';
