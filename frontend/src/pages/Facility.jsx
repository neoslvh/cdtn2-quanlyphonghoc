import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Checkbox, Input, Modal, Select, Table, Tabs, Tag, message } from 'antd';
import dayjs from 'dayjs';
import { api, isApiPending } from '../api';
import { useAuth } from '../auth';
import { PendingApi, fmtRange } from '../components';
import { EQUIPMENT, INCIDENT_STATUS } from '../constants';

const at = (v) => dayjs(v).format('HH:mm DD/MM');

// Danh sách có phân trang, chỉ ghi kết quả của lần gọi mới nhất.
function usePaged(path) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const latest = useRef(0);
  const load = useCallback(() => {
    const mine = ++latest.current;
    setLoading(true);
    return api(`${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=10`)
      .then((d) => { if (mine === latest.current) { setData(d); setError(null); } })
      .catch((e) => { if (mine === latest.current) setError(e); })
      .finally(() => { if (mine === latest.current) setLoading(false); });
  }, [path, page]);
  useEffect(() => { load(); }, [load]);
  return { page, setPage, data, loading, error, load };
}

// Ô nhập ghi chú dùng chung cho bàn giao, nhận trả, phiếu bảo trì.
function NoteModal({ action, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setNote(''); setChecked(false); setError(null); }, [action]);
  if (!action) return null;
  const needCheck = action.kind === 'handover' && action.request.equipment.length > 0;
  const send = async () => {
    if (needCheck && !checked) return setError({ message: 'Xác nhận đã kiểm tra đủ thiết bị trước khi bàn giao.' });
    setBusy(true);
    try {
      await api(action.path, { method: action.method || 'POST', body: { ...action.body, ...(action.noteField ? { [action.noteField]: note.trim() || undefined } : {}) } });
      message.success(action.success);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={action.title} open onCancel={onClose} onOk={send} okText={action.ok} cancelText="Quay lại" confirmLoading={busy} destroyOnHidden>
      {error && (isApiPending(error) ? <PendingApi what={action.what} jira={action.jira} /> : <Alert type="error" showIcon title={error.message} style={{ marginBottom: 12 }} />)}
      {action.kind === 'handover' && (
        <>
          <p>Thiết bị đề xuất: {action.request.equipment.length ? action.request.equipment.map((e) => `${EQUIPMENT[e.itemType]}${e.itemType === 'OTHER' ? ` (${e.otherDescription})` : ''} x${e.quantity}`).join(', ') : 'không có'}.</p>
          {needCheck && <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginBottom: 12 }}>Đã kiểm tra đủ thiết bị, tình trạng tốt</Checkbox>}
        </>
      )}
      <Input.TextArea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={action.placeholder} aria-label={action.placeholder} />
    </Modal>
  );
}

function HandoverTab({ canAct }) {
  const list = usePaged('/requests?status=APPROVED');
  const [action, setAction] = useState(null);
  const handoverState = (r) => {
    if (!r.handover) return <Tag>Chưa bàn giao</Tag>;
    if (!r.handover.returnedAt) return <Tag color="gold">Đang sử dụng từ {at(r.handover.handedOverAt)}</Tag>;
    return <Tag color="green">Đã nhận trả {at(r.handover.returnedAt)}</Tag>;
  };
  return (
    <>
      {list.error && <Alert type="error" showIcon title={list.error.message} style={{ marginBottom: 12 }} />}
      <Table
        rowKey="id"
        size="middle"
        loading={list.loading}
        dataSource={list.data.items}
        scroll={{ x: 900 }}
        locale={{ emptyText: 'Chưa có yêu cầu đã duyệt' }}
        pagination={{ current: list.page, pageSize: list.data.pageSize, total: list.data.total, showSizeChanger: false, onChange: list.setPage }}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 100, render: (v, r) => <Link to={`/requests/${r.id}`}><b>{v}</b></Link> },
          { title: 'Phòng', dataIndex: ['room', 'code'], width: 90 },
          { title: 'Thời gian', width: 220, render: (_, r) => fmtRange(r.startAt, r.endAt) },
          { title: 'Người đề xuất', dataIndex: 'requesterName', width: 160 },
          { title: 'Bàn giao', width: 210, render: (_, r) => handoverState(r) },
          {
            title: '',
            width: 120,
            render: (_, r) => {
              if (!canAct) return null;
              if (!r.handover) return <Button size="small" onClick={() => setAction({ kind: 'handover', request: r, path: `/requests/${r.id}/handover`, noteField: 'conditionNote', title: `Bàn giao phòng ${r.room.code} cho ${r.code}`, ok: 'Xác nhận bàn giao', success: `Đã bàn giao ${r.code}`, placeholder: 'Tình trạng phòng khi bàn giao', what: 'bàn giao', jira: 'SCRUM-22' })}>Bàn giao</Button>;
              if (!r.handover.returnedAt) return <Button size="small" onClick={() => setAction({ kind: 'return', request: r, path: `/requests/${r.id}/return`, noteField: 'conditionNote', title: `Nhận trả phòng ${r.room.code} của ${r.code}`, ok: 'Xác nhận nhận trả', success: `Đã nhận trả ${r.code}`, placeholder: 'Tình trạng phòng và thiết bị sau sử dụng', what: 'nhận trả', jira: 'SCRUM-22' })}>Nhận trả</Button>;
              return null;
            },
          },
        ]}
      />
      <NoteModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); list.load(); }} />
    </>
  );
}

function IncidentTab({ canAct }) {
  const [status, setStatus] = useState();
  const list = usePaged(`/incidents${status ? `?status=${status}` : ''}`);
  const [action, setAction] = useState(null);
  const pending = isApiPending(list.error);
  return (
    <>
      {pending && <PendingApi what="báo hỏng và bảo trì" jira="SCRUM-24, SCRUM-25" />}
      {list.error && !pending && <Alert type="error" showIcon title={list.error.message} style={{ marginBottom: 12 }} />}
      <div className="form-row">
        <Select size="large" allowClear placeholder="Mọi trạng thái" aria-label="Lọc báo hỏng theo trạng thái" onChange={(v) => { list.setPage(1); setStatus(v); }} options={Object.entries(INCIDENT_STATUS).map(([value, [, label]]) => ({ value, label }))} />
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={list.loading}
        dataSource={list.data.items}
        scroll={{ x: 1000 }}
        locale={{ emptyText: pending ? 'Chưa có dữ liệu báo hỏng' : 'Không có báo hỏng nào' }}
        pagination={{ current: list.page, pageSize: list.data.pageSize, total: list.data.total, showSizeChanger: false, onChange: list.setPage }}
        expandable={{ rowExpandable: (i) => Boolean(i.imageName || i.ticket?.note), expandedRowRender: (i) => <p style={{ margin: 0 }}>{i.imageName && <>Ảnh minh chứng: {i.imageName}. </>}{i.ticket?.note && <>Ghi chú bảo trì: {i.ticket.note}</>}</p> }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', width: 110, render: at },
          { title: 'Phòng', dataIndex: ['room', 'code'], width: 90 },
          { title: 'Thiết bị', width: 180, render: (_, i) => <>{i.equipment.assetCode}<br /><small>{i.equipment.name}</small></> },
          { title: 'Mô tả', dataIndex: 'description' },
          { title: 'Người báo', dataIndex: 'reporterName', width: 150, render: (v, i) => <>{v}<br /><small>{i.request.code}</small></> },
          { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (v) => <Tag color={INCIDENT_STATUS[v]?.[0]}>{INCIDENT_STATUS[v]?.[1] || v}</Tag> },
          {
            title: '',
            width: 150,
            render: (_, i) => {
              if (!canAct) return null;
              if (i.status === 'OPEN') return <Button size="small" onClick={() => setAction({ path: '/maintenance-tickets', body: { incidentId: i.id }, noteField: 'note', title: `Tạo phiếu bảo trì cho ${i.equipment.assetCode}`, ok: 'Tạo phiếu', success: 'Đã tạo phiếu bảo trì, thiết bị chuyển Đang bảo trì', placeholder: 'Ghi chú bảo trì (không bắt buộc)', what: 'phiếu bảo trì', jira: 'SCRUM-25' })}>Tạo phiếu bảo trì</Button>;
              if (i.ticket && i.ticket.status !== 'DONE') return <Button size="small" onClick={() => setAction({ path: `/maintenance-tickets/${i.ticket.id}`, method: 'PATCH', body: { status: 'DONE' }, noteField: 'note', title: `Hoàn tất bảo trì ${i.equipment.assetCode}`, ok: 'Hoàn tất', success: 'Đã hoàn tất bảo trì, thiết bị trở lại tình trạng Tốt', placeholder: 'Kết quả bảo trì', what: 'phiếu bảo trì', jira: 'SCRUM-25' })}>Hoàn tất bảo trì</Button>;
              return null;
            },
          },
        ]}
      />
      <NoteModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); list.load(); }} />
    </>
  );
}

// WF-11 phía cơ sở vật chất (FR-17, FR-19, FR-20): bàn giao, nhận trả, xử lý báo hỏng. Quản trị viên chỉ xem.
export default function Facility() {
  const { user } = useAuth();
  const canAct = user.role === 'FACILITY_STAFF';
  return (
    <>
      <section className="app-band">
        <h1>Bàn giao và báo hỏng</h1>
        <p>Bàn giao phòng cho lượt đặt đã duyệt, nhận trả sau khi sử dụng và xử lý thiết bị bị báo hỏng.</p>
      </section>
      <div className="app-content">
        {!canAct && <Alert type="info" showIcon style={{ marginBottom: 16 }} title="Quản trị viên chỉ xem, nhân viên cơ sở vật chất mới thao tác được." />}
        <div className="panel">
          <Tabs items={[{ key: 'handover', label: 'Bàn giao / nhận trả', children: <HandoverTab canAct={canAct} /> }, { key: 'incidents', label: 'Báo hỏng và bảo trì', children: <IncidentTab canAct={canAct} /> }]} />
        </div>
      </div>
    </>
  );
}
