import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Select, Table, Tag } from 'antd';
import { api } from '../api';
import { fmtRange, pendingOrg } from '../components';
import { REQUEST_STATUS } from '../constants';
import { useAuth } from '../auth';

// WF-04: danh sách yêu cầu và trạng thái xử lý (FR-10, SCRUM-15). Người đăng ký thấy phiếu của mình, quản trị viên thấy tất cả.
export default function MyRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const admin = user.role === 'ADMIN';
  const [status, setStatus] = useState();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const p = new URLSearchParams({ page, pageSize: 10 });
    if (status) p.set('status', status);
    setLoading(true);
    api(`/requests?${p}`)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, page]);

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 100, render: (v, r) => <Link to={`/requests/${r.id}`}><b>{v}</b></Link> },
    ...(admin ? [{ title: 'Người đề xuất', dataIndex: 'requesterName', width: 160 }] : []),
    { title: 'Phòng', dataIndex: ['room', 'code'], width: 100 },
    { title: 'Thời gian', render: (_, r) => fmtRange(r.startAt, r.endAt), width: 230 },
    { title: 'Số người', dataIndex: 'participantCount', width: 90, align: 'right' },
    { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (v) => <Tag color={REQUEST_STATUS[v][0]}>{REQUEST_STATUS[v][1]}</Tag> },
    { title: 'Đang chờ', render: (_, r) => pendingOrg(r.steps) || '-' },
  ];

  return (
    <>
      <section className="app-band">
        <h1>{admin ? 'Tất cả yêu cầu' : 'Yêu cầu của tôi'}</h1>
        <p>Theo dõi trạng thái và bước đang xử lý của từng yêu cầu sử dụng phòng.</p>
      </section>
      <div className="app-content">
        <div className="panel">
          <h2>Danh sách yêu cầu</h2>
          <div className="form-row">
            <Select size="large" allowClear placeholder="Mọi trạng thái" aria-label="Lọc theo trạng thái" onChange={(v) => { setPage(1); setStatus(v); }} options={Object.entries(REQUEST_STATUS).map(([value, [, label]]) => ({ value, label }))} />
            {!admin && <Button type="primary" size="large" style={{ flex: '0 0 auto' }} onClick={() => navigate('/requests/new')}>Tạo yêu cầu</Button>}
          </div>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            dataSource={data.items}
            columns={columns}
            scroll={{ x: 820 }}
            locale={{ emptyText: 'Chưa có yêu cầu nào' }}
            pagination={{ current: page, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: setPage }}
          />
        </div>
      </div>
    </>
  );
}
