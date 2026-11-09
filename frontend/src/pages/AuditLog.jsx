import { useEffect, useState } from 'react';
import { Alert, Input, Select, Table } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../constants';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
const pretty = (v) => (v == null ? 'Không có' : JSON.stringify(v, null, 2));

// WF-12: nhật ký thao tác dành cho quản trị viên (FR-21, SCRUM-26). Ghi người thực hiện, hành động, thời gian và giá trị trước, sau.
export default function AuditLog() {
  const [filter, setFilter] = useState({});
  const [idError, setIdError] = useState('');
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/users').then((d) => setUsers(d.items)).catch(() => {});
  }, []);
  useEffect(() => {
    const p = new URLSearchParams({ page, pageSize: 20 });
    Object.entries(filter).forEach(([k, v]) => v && p.set(k, v));
    setLoading(true);
    // Đổi bộ lọc nhanh thì phản hồi của lần gọi cũ bị bỏ, không ghi đè kết quả của bộ lọc mới.
    let ignore = false;
    api(`/audit-logs?${p}`)
      .then((d) => { if (!ignore) { setData(d); setError(null); } })
      .catch((e) => { if (!ignore) setError(e.message); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [filter, page]);

  const setF = (key) => (value) => { setPage(1); setFilter((f) => ({ ...f, [key]: value || undefined })); };
  const searchId = (value) => {
    const v = value.trim();
    if (v && !UUID.test(v)) return setIdError('Mã đối tượng phải là UUID');
    setIdError('');
    setF('entityId')(v);
  };

  const columns = [
    { title: 'Thời gian', dataIndex: 'createdAt', width: 160, render: (v) => dayjs(v).format('HH:mm:ss DD/MM/YYYY') },
    { title: 'Người thực hiện', dataIndex: 'userName', width: 190, render: (v) => v || 'Hệ thống' },
    { title: 'Hành động', dataIndex: 'action', width: 280, render: (v) => AUDIT_ACTION[v] || v },
    { title: 'Đối tượng', width: 220, render: (_, r) => <>{AUDIT_ENTITY[r.entityType] || r.entityType} <small title={r.entityId} style={{ color: 'var(--vlu-gray)' }}>{r.entityId.slice(0, 8)}</small></> },
  ];

  return (
    <>
      <section className="app-band">
        <h1>Nhật ký thao tác</h1>
        <p>Đối chiếu khi có khiếu nại hoặc cần truy vết: ai làm gì, lúc nào, giá trị trước và sau khi thay đổi.</p>
      </section>
      <div className="app-content">
        <div className="panel">
          <h2>Tra cứu</h2>
          <div className="form-row">
            <Select size="large" allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Mọi người thực hiện" aria-label="Người thực hiện" onChange={setF('userId')} options={users.map((u) => ({ value: u.id, label: `${u.fullName} (${u.email})` }))} />
            <Select size="large" allowClear placeholder="Mọi hành động" aria-label="Hành động" onChange={setF('action')} options={options(AUDIT_ACTION)} />
            <Select size="large" allowClear placeholder="Mọi đối tượng" aria-label="Loại đối tượng" onChange={setF('entityType')} options={options(AUDIT_ENTITY)} />
            <div>
              <Input.Search size="large" allowClear placeholder="Mã đối tượng (UUID)" aria-label="Mã đối tượng" status={idError ? 'error' : undefined} onSearch={searchId} onChange={() => setIdError('')} />
              {idError && <div role="alert" style={{ color: 'var(--ant-color-error, #ff4d4f)', marginTop: 4 }}>{idError}</div>}
            </div>
          </div>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            dataSource={data.items}
            columns={columns}
            scroll={{ x: 900 }}
            locale={{ emptyText: 'Không có bản ghi nào' }}
            expandable={{
              rowExpandable: (r) => r.before != null || r.after != null,
              expandedRowRender: (r) => (
                <div className="audit-diff">
                  <div><b>Trước</b><pre>{pretty(r.before)}</pre></div>
                  <div><b>Sau</b><pre>{pretty(r.after)}</pre></div>
                </div>
              ),
            }}
            pagination={{ current: page, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: setPage }}
          />
        </div>
      </div>
    </>
  );
}
