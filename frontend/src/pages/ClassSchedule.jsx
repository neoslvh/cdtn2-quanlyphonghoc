import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, Modal, Popconfirm, Radio, Result, Select, Statistic, Table, Tag, Upload, message } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api';
import { SCHEDULE_COLUMNS, SESSION_STATUS } from '../constants';

const fmt = (v) => dayjs(v).format('HH:mm DD/MM/YYYY');

function download(name, text) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const downloadTemplate = () =>
  download('thoi-khoa-bieu-mau.csv', [SCHEDULE_COLUMNS.join(','), 'HK1 2026-2027,IT001,Lập trình Web,K29-SE01,2,1,3,A.10.01,14/09/2026,27/12/2026'].join('\n'));

const downloadErrors = (errors) =>
  download('loi-thoi-khoa-bieu.csv', ['Dòng,Cột,Lỗi', ...errors.map((e) => `${e.row},${e.column || ''},"${e.message}"`)].join('\n'));

// WF-13: nhập thời khóa biểu chính khóa của Phòng Đào tạo (FR-23), chia ba bước: tải tệp, xem trước tác động, xác nhận.
export default function ClassSchedule() {
  const [semester, setSemester] = useState('HK1 2026-2027');
  const [mode, setMode] = useState('REPLACE');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(null);
  const [fail, setFail] = useState(null);
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);

  const check = async () => {
    if (!files.length) {
      setFail('Chọn tệp thời khóa biểu trước khi kiểm tra.');
      return;
    }
    const fd = new FormData();
    fd.append('file', files[0].originFileObj);
    fd.append('semester', semester);
    fd.append('mode', mode);
    setBusy(true);
    setFail(null);
    setErrors(null);
    setPreview(null);
    setDone(null);
    try {
      setPreview(await api('/class-schedule/imports', { method: 'POST', body: fd }));
    } catch (err) {
      if (err.code === 'IMPORT_INVALID') setErrors(err.details);
      else setFail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const [sessionsKey, setSessionsKey] = useState(0);
  const discard = async () => {
    await api(`/class-schedule/imports/${preview.batchId}`, { method: 'DELETE' });
    setPreview(null);
    message.info('Đã hủy bản xem trước');
  };
  const commit = async () => {
    setBusy(true);
    try {
      setDone(await api(`/class-schedule/imports/${preview.batchId}/commit`, { method: 'POST' }));
      setPreview(null);
      setFiles([]);
      setSessionsKey((k) => k + 1);
    } catch (err) {
      setFail(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="app-band">
        <h1>Lịch học chính khóa</h1>
        <p>Nhập thời khóa biểu của Phòng Đào tạo. Các buổi học có hiệu lực sẽ chiếm phòng và các yêu cầu bị trùng sẽ được hủy.</p>
      </section>
      <div className="app-content">
        <div className="panel">
          <h2>Bước 1. Tải tệp thời khóa biểu</h2>
          <div className="form-row">
            <Form layout="vertical" style={{ display: 'contents' }}>
              <Form.Item label="Học kỳ" className="grow2">
                <Input size="large" aria-label="Học kỳ" value={semester} onChange={(e) => setSemester(e.target.value)} />
              </Form.Item>
              <Form.Item label="Chế độ nhập" className="grow2">
                <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
                  <Radio value="REPLACE">Thay thế học kỳ</Radio>
                  <Radio value="APPEND">Thêm mới</Radio>
                </Radio.Group>
              </Form.Item>
            </Form>
          </div>
          <div className="form-row" style={{ alignItems: 'center' }}>
            <Upload maxCount={1} fileList={files} showUploadList={false} beforeUpload={() => false} onChange={({ fileList }) => setFiles(fileList)} accept=".csv,.xlsx">
              <Button>{files.length ? `Đã chọn: ${files[0].name}` : 'Chọn tệp (CSV hoặc Excel)'}</Button>
            </Upload>
            <Button onClick={downloadTemplate}>Tải tệp mẫu</Button>
            <Button type="primary" loading={busy} onClick={check}>Kiểm tra tệp</Button>
          </div>
          <p className="note">Tệp có đúng 10 cột: {SCHEDULE_COLUMNS.join(', ')}. Ngày dạng dd/mm/yyyy, thứ từ 2 đến 8. Tệp lỗi sẽ không lưu dòng nào.</p>
          {fail && <Alert type="error" showIcon title={fail} style={{ marginTop: 12 }} />}
        </div>

        {errors && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Bước 2. Tệp có {errors.length} lỗi</h2>
            <Alert type="error" showIcon title="Không có dòng nào được lưu. Sửa các lỗi dưới đây rồi tải lại tệp." style={{ marginBottom: 12 }} />
            <Table
              rowKey={(e) => `${e.row}-${e.column}-${e.message}`}
              size="small"
              dataSource={errors}
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
              columns={[{ title: 'Dòng', dataIndex: 'row', width: 80 }, { title: 'Cột', dataIndex: 'column', width: 140 }, { title: 'Lỗi', dataIndex: 'message' }]}
            />
            <div className="form-actions"><Button onClick={() => downloadErrors(errors)}>Tải danh sách lỗi</Button></div>
          </div>
        )}

        {preview && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Bước 2. Kết quả kiểm tra</h2>
            <div className="stat-row">
              <Statistic title="Dòng hợp lệ" value={preview.rowCount} />
              <Statistic title="Buổi học sẽ tạo" value={preview.sessionCount} />
              <Statistic title="Yêu cầu bị trùng" value={preview.conflicts.length} styles={{ content: { color: preview.conflicts.length ? '#d72134' : undefined } }} />
            </div>
            {preview.conflicts.length > 0 && (
              <>
                <Alert type="warning" showIcon style={{ margin: '12px 0' }} title="Các yêu cầu sau trùng giờ với lớp học mới và sẽ bị hủy khi bạn xác nhận nhập (BR-11)." />
                <Table
                  rowKey="requestId"
                  size="small"
                  dataSource={preview.conflicts}
                  pagination={{ pageSize: 6, hideOnSinglePage: true }}
                  columns={[
                    { title: 'Yêu cầu', dataIndex: 'requestCode', width: 100 },
                    { title: 'Phòng', dataIndex: 'roomCode', width: 90 },
                    { title: 'Thời gian', render: (_, c) => `${fmt(c.startAt)} đến ${dayjs(c.endAt).format('HH:mm')}` },
                    { title: 'Trạng thái', dataIndex: 'requestStatus', width: 110 },
                    { title: 'Trùng với lớp', render: (_, c) => `${c.conflictWith.courseCode} (${c.conflictWith.classCode})` },
                  ]}
                />
              </>
            )}
            <div className="form-actions">
              <Button onClick={discard}>Hủy bản xem trước</Button>
              <Popconfirm
                title="Xác nhận nhập thời khóa biểu?"
                description={preview.conflicts.length ? `${preview.conflicts.length} yêu cầu bị trùng sẽ bị hủy và người đăng ký được thông báo.` : 'Các buổi học sẽ có hiệu lực ngay.'}
                okText="Xác nhận nhập"
                cancelText="Quay lại"
                onConfirm={commit}
              >
                <Button type="primary" loading={busy}>Xác nhận nhập</Button>
              </Popconfirm>
            </div>
          </div>
        )}

        {done && (
          <div className="panel" style={{ marginTop: 16 }}>
            <Result
              status="success"
              title="Đã nhập thời khóa biểu"
              subTitle={`${done.activatedSessions} buổi học có hiệu lực, ${done.replacedSessions} buổi cũ bị thay thế, ${done.cancelledRequests.length} yêu cầu bị hủy.`}
            />
            {done.cancelledRequests.length > 0 && (
              <Table
                rowKey="id"
                size="small"
                dataSource={done.cancelledRequests}
                pagination={false}
                columns={[{ title: 'Yêu cầu', dataIndex: 'requestCode', width: 100 }, { title: 'Người đăng ký', dataIndex: 'requesterName', width: 160 }, { title: 'Lý do hủy', dataIndex: 'cancelReason' }]}
              />
            )}
          </div>
        )}

        <SessionList reloadKey={sessionsKey} />
      </div>
    </>
  );
}

// Bước 3: tra cứu từng buổi học, sửa giờ hoặc phòng, hủy buổi (nghỉ, học bù).
function SessionList({ reloadKey }) {
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => { api('/rooms').then((d) => setRooms(d.items)); }, []);
  const load = useCallback(() => {
    const p = new URLSearchParams({ page, pageSize: 10 });
    if (filter.roomCode) p.set('roomCode', filter.roomCode);
    if (filter.status) p.set('status', filter.status);
    if (filter.range) { p.set('from', filter.range[0].format('YYYY-MM-DD')); p.set('to', filter.range[1].format('YYYY-MM-DD')); }
    setLoading(true);
    api(`/class-schedule?${p}`).then(setData).finally(() => setLoading(false));
  }, [filter, page]);
  useEffect(load, [load, reloadKey]);

  const openEdit = (s) => {
    setFormError(null);
    form.setFieldsValue({ roomCode: s.roomCode, range: [dayjs(s.startAt), dayjs(s.endAt)] });
    setEditing(s);
  };
  const save = async ({ roomCode, range }) => {
    try {
      await api(`/class-schedule/${editing.id}`, { method: 'PATCH', body: { roomCode, startAt: range[0].format(), endAt: range[1].format() } });
      message.success('Đã cập nhật buổi học');
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err);
    }
  };
  const cancel = async (id) => {
    await api(`/class-schedule/${id}/cancel`, { method: 'POST' });
    message.success('Đã hủy buổi học');
    load();
  };

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h2>Bước 3. Tra cứu các buổi học</h2>
      <div className="form-row">
        <Select allowClear size="large" placeholder="Tất cả phòng" style={{ minWidth: 180 }} value={filter.roomCode} onChange={(v) => { setPage(1); setFilter((f) => ({ ...f, roomCode: v })); }} options={rooms.map((r) => ({ value: r.code, label: r.code }))} />
        <DatePicker.RangePicker size="large" format="DD/MM/YYYY" value={filter.range} onChange={(v) => { setPage(1); setFilter((f) => ({ ...f, range: v || undefined })); }} />
        <Select allowClear size="large" placeholder="Mọi trạng thái" style={{ minWidth: 170 }} value={filter.status} onChange={(v) => { setPage(1); setFilter((f) => ({ ...f, status: v })); }} options={Object.entries(SESSION_STATUS).map(([value, [, label]]) => ({ value, label }))} />
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={data.items}
        scroll={{ x: 820 }}
        pagination={{ current: page, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: setPage }}
        columns={[
          { title: 'Phòng', dataIndex: 'roomCode', width: 90, render: (v) => <b>{v}</b> },
          { title: 'Mã môn', dataIndex: 'courseCode', width: 90 },
          { title: 'Tên môn', dataIndex: 'courseName' },
          { title: 'Lớp', dataIndex: 'classCode', width: 110 },
          { title: 'Thời gian', width: 220, render: (_, s) => `${fmt(s.startAt)} đến ${dayjs(s.endAt).format('HH:mm')}` },
          { title: 'Trạng thái', dataIndex: 'status', width: 130, render: (v) => <Tag color={SESSION_STATUS[v][0]}>{SESSION_STATUS[v][1]}</Tag> },
          {
            title: '',
            width: 150,
            render: (_, s) =>
              s.status === 'ACTIVE' ? (
                <>
                  <Button type="link" size="small" onClick={() => openEdit(s)}>Sửa</Button>
                  <Popconfirm title="Hủy buổi học này?" okText="Hủy buổi" cancelText="Quay lại" onConfirm={() => cancel(s.id)}>
                    <Button type="link" size="small" danger>Hủy buổi</Button>
                  </Popconfirm>
                </>
              ) : null,
          },
        ]}
      />
      <Modal title="Sửa buổi học" open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        {formError && <Alert type="error" showIcon title={formError.message} style={{ marginBottom: 12 }} description={formError.details?.map((d) => (d.source === 'ROOM_BOOKING' ? `Lượt đặt ${d.requestCode}` : `Lớp ${d.courseCode} (${d.classCode})`)).join(', ')} />}
        <Form form={form} layout="vertical" requiredMark={false} onFinish={save}>
          <Form.Item label="Phòng" name="roomCode" rules={[{ required: true }]}>
            <Select options={rooms.map((r) => ({ value: r.code, label: `${r.code} · ${r.capacity} chỗ` }))} />
          </Form.Item>
          <Form.Item label="Thời gian" name="range" rules={[{ required: true, message: 'Chọn thời gian' }]}>
            <DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
