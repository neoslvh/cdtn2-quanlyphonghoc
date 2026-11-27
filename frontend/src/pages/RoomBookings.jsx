import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Spin } from 'antd';
import dayjs from 'dayjs';
import { api, isApiPending } from '../api';
import { PendingApi, fmtRange } from '../components';

// Lịch đã duyệt của một phòng theo tuần (FR-11, SCRUM-16): xem phòng bận lúc nào trước khi lập phiếu hoặc bàn giao.
export default function RoomBookings({ room, onClose }) {
  const [week, setWeek] = useState(() => dayjs().startOf('week').add(1, 'day'));
  const [state, setState] = useState({ items: null, error: null });

  useEffect(() => {
    if (!room) return undefined;
    let ignore = false;
    setState({ items: null, error: null });
    const p = new URLSearchParams({ from: week.format(), to: week.add(7, 'day').format() });
    api(`/rooms/${room.id}/bookings?${p}`)
      .then((d) => { if (!ignore) setState({ items: d.items, error: null }); })
      .catch((error) => { if (!ignore) setState({ items: null, error }); });
    return () => { ignore = true; };
  }, [room, week]);

  return (
    <Drawer title={room ? `Lịch phòng ${room.code}` : ''} open={Boolean(room)} onClose={onClose} size={480} destroyOnHidden>
      <div className="week-nav">
        <Button onClick={() => setWeek((w) => w.subtract(7, 'day'))} aria-label="Tuần trước">Tuần trước</Button>
        <b>{week.format('DD/MM')} đến {week.add(6, 'day').format('DD/MM/YYYY')}</b>
        <Button onClick={() => setWeek((w) => w.add(7, 'day'))} aria-label="Tuần sau">Tuần sau</Button>
      </div>
      {state.error && (isApiPending(state.error) ? <PendingApi what="lịch phòng" jira="SCRUM-16" /> : <Alert type="error" showIcon title={state.error.message} />)}
      {!state.error && !state.items && <Spin />}
      {state.items && !state.items.length && <Empty description="Tuần này phòng chưa có lượt đặt đã duyệt" />}
      {state.items && state.items.length > 0 && (
        <ul className="booking-list">
          {state.items.map((b) => (
            <li key={b.requestId}>
              <b>{fmtRange(b.startAt, b.endAt)}</b>
              <span>{b.requestCode} · {b.requesterName}</span>
              {b.purpose && <small>{b.purpose}</small>}
            </li>
          ))}
        </ul>
      )}
      <p className="note">Chỉ hiện lượt đặt đã duyệt. Lịch học chính khóa xem ở trang Lịch học chính khóa.</p>
    </Drawer>
  );
}
