import { useEffect, useState } from 'react';
import { Alert, DatePicker, Empty, Segmented, Spin, Table } from 'antd';
import dayjs from 'dayjs';
import { api, isApiPending } from '../api';
import { PendingApi } from '../components';
import { REQUEST_STATUS } from '../constants';

const fmtHours = (h) => `${Number(h.toFixed(1)).toLocaleString('vi-VN')} giờ`;

// Thanh ngang một màu, mỗi dòng một nhãn và giá trị ghi ngay bên cạnh, rê chuột hiện chú thích.
function BarList({ rows, label = 'Danh sách' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="bar-list" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.text}`}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="bar-value">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

// WF-12 phần báo cáo (FR-22, SCRUM-27): số yêu cầu theo trạng thái, tần suất sử dụng phòng, thiết bị hỏng.
export default function Reports() {
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [view, setView] = useState('chart');
  const [state, setState] = useState({ data: null, error: null });

  useEffect(() => {
    let ignore = false;
    setState({ data: null, error: null });
    const p = new URLSearchParams({ from: range[0].startOf('day').format(), to: range[1].endOf('day').format() });
    api(`/reports/summary?${p}`)
      .then((data) => { if (!ignore) setState({ data, error: null }); })
      .catch((error) => { if (!ignore) setState({ data: null, error }); });
    return () => { ignore = true; };
  }, [range]);

  const d = state.data;
  const statusRows = d ? Object.entries(REQUEST_STATUS).map(([k, [, label]]) => ({ key: k, label, value: d.requests.byStatus[k] || 0, text: String(d.requests.byStatus[k] || 0) })) : [];
  const roomRows = d ? d.roomUsage.map((u) => ({ key: u.roomCode, label: u.roomCode, value: u.hours, text: `${fmtHours(u.hours)}, ${u.bookings} lượt` })) : [];

  return (
    <>
      <section className="app-band">
        <h1>Báo cáo thống kê</h1>
        <p>Tình hình yêu cầu, tần suất sử dụng phòng và thiết bị hỏng trong khoảng thời gian chọn.</p>
      </section>
      <div className="app-content">
        <div className="form-row" style={{ alignItems: 'center', marginBottom: 16 }}>
          <DatePicker.RangePicker size="large" format="DD/MM/YYYY" allowClear={false} value={range} onChange={(v) => v && setRange(v)} aria-label="Khoảng thời gian báo cáo" />
          <Segmented style={{ flex: '0 0 auto' }} value={view} onChange={setView} options={[{ value: 'chart', label: 'Biểu đồ' }, { value: 'table', label: 'Bảng số liệu' }]} />
        </div>
        {state.error && (isApiPending(state.error) ? <PendingApi what="báo cáo thống kê" jira="SCRUM-27" /> : <Alert type="error" showIcon title={state.error.message} />)}
        {!state.error && !d && <Spin />}
        {d && (
          <>
            <div className="stat-grid" aria-label="Số liệu tổng">
              <div className="stat-card"><span className="stat-value">{d.requests.total}</span><span className="stat-label">Tổng yêu cầu</span></div>
              <div className="stat-card"><span className="stat-value">{d.requests.byStatus.APPROVED || 0}</span><span className="stat-label">Đã duyệt</span></div>
              <div className="stat-card"><span className="stat-value">{d.requests.byStatus.REJECTED || 0}</span><span className="stat-label">Bị từ chối</span></div>
              <div className="stat-card"><span className="stat-value">{d.brokenEquipment}</span><span className="stat-label">Thiết bị hỏng hoặc đang bảo trì</span></div>
              <div className="stat-card"><span className="stat-value">{d.openIncidents ?? 0}</span><span className="stat-label">Báo hỏng chưa xử lý xong</span></div>
            </div>
            <div className="report-grid">
              <div className="panel">
                <h2>Yêu cầu theo trạng thái</h2>
                {view === 'chart'
                  ? <BarList rows={statusRows} label="Yêu cầu theo trạng thái" />
                  : <Table size="small" rowKey="key" pagination={false} dataSource={statusRows} columns={[{ title: 'Trạng thái', dataIndex: 'label' }, { title: 'Số yêu cầu', dataIndex: 'value', align: 'right' }]} />}
              </div>
              <div className="panel">
                <h2>Sử dụng phòng (lượt đã duyệt)</h2>
                {!roomRows.length && <Empty description="Chưa có lượt đặt đã duyệt trong khoảng này" />}
                {roomRows.length > 0 && (view === 'chart'
                  ? <BarList rows={roomRows} label="Giờ sử dụng theo phòng" />
                  : <Table size="small" rowKey="roomCode" pagination={false} dataSource={d.roomUsage} columns={[{ title: 'Phòng', dataIndex: 'roomCode' }, { title: 'Số lượt', dataIndex: 'bookings', align: 'right' }, { title: 'Số giờ', dataIndex: 'hours', align: 'right', render: fmtHours }]} />)}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
