import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Input, Modal, Table, Tag, message } from 'antd';
import { api } from '../api';
import { ConflictAlert, StepsView, fmtRange, pendingOrg } from '../components';
import { EQUIPMENT } from '../constants';

// WF-05: duyệt yêu cầu (FR-10, FR-11, SCRUM-18). Chỉ hiện các phiếu đang chờ đơn vị của người duyệt.
// Từ chối bắt buộc có lý do. Ở bước cuối máy chủ kiểm tra lại phòng, lịch học và lượt đặt, trùng thì báo ROOM_CONFLICT.
export default function Approvals() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState(null); // 'approve' hoặc 'reject'
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const latest = useRef(0);
  // Chỉ lần gọi mới nhất được ghi vào bảng, phản hồi cũ đến muộn bị bỏ.
  const load = useCallback(() => {
    const mine = ++latest.current;
    setLoading(true);
    return api(`/approvals?page=${page}&pageSize=10`)
      .then((d) => { if (mine === latest.current) { setData(d); setError(null); } })
      .catch((e) => { if (mine === latest.current) setError(e.message); })
      .finally(() => { if (mine === latest.current) setLoading(false); });
  }, [page]);
  useEffect(() => { load(); }, [load]);

  const open = (r) => { setActive(r); setActionError(null); };
  const close = () => { setActive(null); setMode(null); setReason(''); setReasonError(''); setActionError(null); };
  const isLast = (r) => r.steps[r.steps.length - 1].status === 'PENDING';

  const decide = async () => {
    if (mode === 'reject' && !reason.trim()) return setReasonError('Nhập lý do từ chối');
    setBusy(true);
    try {
      await api(`/requests/${active.id}/${mode}`, { method: 'POST', body: { reason: reason.trim() || undefined } });
      message.success(mode === 'approve' ? `Đã đồng ý ${active.code}` : `Đã từ chối ${active.code}`);
      close();
      load();
    } catch (err) {
      // Phiếu đã đổi trạng thái hoặc không còn tới lượt thì tải lại danh sách để phản ánh đúng.
      setMode(null);
      setActionError(err);
      if (['INVALID_STATE', 'FORBIDDEN', 'NOT_FOUND'].includes(err.code)) load();
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 100, render: (v) => <b>{v}</b> },
    { title: 'Người đề xuất', dataIndex: 'requesterName', width: 160 },
    { title: 'Đơn vị đăng ký', dataIndex: 'organizationName' },
    { title: 'Phòng', dataIndex: ['room', 'code'], width: 90 },
    { title: 'Thời gian', render: (_, r) => fmtRange(r.startAt, r.endAt), width: 230 },
    { title: 'Số người', dataIndex: 'participantCount', width: 90, align: 'right' },
    { title: '', width: 120, render: (_, r) => <Button type="link" size="small" onClick={() => open(r)}>Xem và xử lý</Button> },
  ];

  return (
    <>
      <section className="app-band">
        <h1>Duyệt yêu cầu</h1>
        <p>Các yêu cầu đang chờ đơn vị của bạn. Sau khi đồng ý, yêu cầu chuyển sang đơn vị kế tiếp hoặc hoàn tất ở bước cuối.</p>
      </section>
      <div className="app-content">
        <div className="panel">
          <h2>Chờ duyệt</h2>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            dataSource={data.items}
            columns={columns}
            scroll={{ x: 900 }}
            locale={{ emptyText: 'Không có yêu cầu nào đang chờ bạn' }}
            pagination={{ current: page, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: setPage }}
          />
        </div>
      </div>

      <Drawer title={active ? `Yêu cầu ${active.code}` : ''} open={Boolean(active)} onClose={close} size={560} destroyOnHidden>
        {active && (
          <>
            {actionError && (actionError.code === 'ROOM_CONFLICT' ? <ConflictAlert error={actionError} /> : <Alert type="error" showIcon title={actionError.message} style={{ marginBottom: 16 }} />)}
            <p><Tag color="gold">Đang chờ {pendingOrg(active.steps)}</Tag>{isLast(active) && <Tag>Bước cuối</Tag>}</p>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Người đề xuất">{active.requesterName}</Descriptions.Item>
              <Descriptions.Item label="Đơn vị đăng ký">{active.organizationName}</Descriptions.Item>
              <Descriptions.Item label="Phòng">{active.room.code} · {active.room.name} · {active.room.capacity} chỗ</Descriptions.Item>
              <Descriptions.Item label="Thời gian">{fmtRange(active.startAt, active.endAt)}</Descriptions.Item>
              <Descriptions.Item label="Số người tham dự">{active.participantCount}</Descriptions.Item>
              <Descriptions.Item label="Mục đích">{active.purpose}</Descriptions.Item>
              <Descriptions.Item label="Thiết bị">
                {active.equipment.length ? active.equipment.map((e) => <Tag key={e.itemType}>{EQUIPMENT[e.itemType]}{e.itemType === 'OTHER' ? `: ${e.otherDescription}` : ''} x{e.quantity}</Tag>) : 'Không đề xuất thiết bị'}
              </Descriptions.Item>
              <Descriptions.Item label="Tài liệu đính kèm">{active.attachments.length ? active.attachments.map((a) => a.fileName).join(', ') : 'Không có'}</Descriptions.Item>
            </Descriptions>
            <h3 style={{ margin: '20px 0 8px' }}>Tiến độ duyệt</h3>
            <StepsView steps={active.steps} />
            <div className="form-actions">
              <Button danger onClick={() => setMode('reject')}>Từ chối</Button>
              <Button type="primary" onClick={() => setMode('approve')}>Đồng ý</Button>
            </div>
          </>
        )}
      </Drawer>

      <Modal
        title={mode === 'approve' ? 'Đồng ý yêu cầu' : 'Từ chối yêu cầu'}
        open={Boolean(mode)}
        onCancel={() => { setMode(null); setReasonError(''); }}
        onOk={decide}
        okText={mode === 'approve' ? 'Đồng ý duyệt' : 'Từ chối'}
        okButtonProps={{ danger: mode === 'reject' }}
        cancelText="Quay lại"
        confirmLoading={busy}
        destroyOnHidden
      >
        {mode === 'approve' && active && isLast(active) && <p>Đây là bước cuối. Hệ thống kiểm tra lại phòng, lịch học chính khóa và các lượt đặt đã duyệt trước khi giữ phòng.</p>}
        <Input.TextArea
          rows={3}
          maxLength={500}
          value={reason}
          status={reasonError ? 'error' : undefined}
          onChange={(e) => { setReason(e.target.value); setReasonError(''); }}
          placeholder={mode === 'reject' ? 'Lý do từ chối (bắt buộc)' : 'Ghi chú (không bắt buộc)'}
          aria-label={mode === 'reject' ? 'Lý do từ chối' : 'Ghi chú'}
        />
        {reasonError && <div role="alert" style={{ color: 'var(--ant-color-error, #ff4d4f)', marginTop: 6 }}>{reasonError}</div>}
      </Modal>
    </>
  );
}
