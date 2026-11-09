import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Pagination, Segmented, Tag } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api';
import { useAuth } from '../auth';
import { notifyChanged } from '../notifications';

// Thông báo của tôi (FR-14, SCRUM-19): duyệt, từ chối, hủy do trùng lịch học chính khóa. Mỗi người chỉ thấy thông báo của mình.
export default function Notifications() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, unread: 0, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Người duyệt không có trang chi tiết yêu cầu nên không hiện liên kết.
  const canOpenRequest = ['REQUESTER', 'ADMIN', 'FACILITY_STAFF'].includes(user.role);

  const latest = useRef(0);
  // Chỉ lần gọi mới nhất được ghi vào bảng, phản hồi cũ đến muộn bị bỏ.
  const load = useCallback(() => {
    const mine = ++latest.current;
    setLoading(true);
    return api(`/notifications?page=${page}&pageSize=10${filter === 'unread' ? '&unread=true' : ''}`)
      .then((d) => { if (mine === latest.current) { setData(d); setError(null); } })
      .catch((e) => { if (mine === latest.current) setError(e.message); })
      .finally(() => { if (mine === latest.current) setLoading(false); });
  }, [page, filter]);
  useEffect(() => { load(); }, [load]);

  const act = async (path, method) => {
    try {
      await api(path, { method });
      notifyChanged();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <section className="app-band">
        <h1>Thông báo</h1>
        <p>Kết quả xử lý yêu cầu và các thay đổi ảnh hưởng đến yêu cầu của bạn.</p>
      </section>
      <div className="app-content">
        <div className="panel">
          <h2>Thông báo của tôi{data.unread ? ` (${data.unread} chưa đọc)` : ''}</h2>
          <div className="form-row" style={{ alignItems: 'center', marginBottom: 12 }}>
            <Segmented
              value={filter}
              onChange={(v) => { setPage(1); setFilter(v); }}
              options={[{ value: 'all', label: 'Tất cả' }, { value: 'unread', label: 'Chưa đọc' }]}
              style={{ flex: '0 0 auto' }}
            />
            <div style={{ flex: 1 }} />
            <Button style={{ flex: '0 0 auto' }} disabled={!data.unread} onClick={() => act('/notifications/read-all', 'POST')}>Đánh dấu tất cả đã đọc</Button>
          </div>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
          {!loading && !data.items.length ? (
            <Empty description={filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'} />
          ) : (
            <ul className="notice-list" aria-busy={loading}>
              {data.items.map((n) => (
                <li key={n.id} className={n.read ? 'notice' : 'notice notice-unread'}>
                  <div className="notice-head">
                    <b>{n.title}</b>
                    {!n.read && <Tag color="red">Mới</Tag>}
                    <small>{dayjs(n.createdAt).format('HH:mm DD/MM/YYYY')}</small>
                  </div>
                  <p>{n.message}</p>
                  <div className="notice-actions">
                    {n.requestId && canOpenRequest && <Link to={`/requests/${n.requestId}`}>Xem yêu cầu</Link>}
                    {!n.read && <Button type="link" size="small" onClick={() => act(`/notifications/${n.id}/read`, 'PATCH')}>Đánh dấu đã đọc</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.total > data.pageSize && <Pagination style={{ marginTop: 16 }} current={page} pageSize={data.pageSize} total={data.total} showSizeChanger={false} onChange={setPage} />}
        </div>
      </div>
    </>
  );
}
