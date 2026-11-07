import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Kiểm tra dữ liệu giả cư xử đúng API Contract: mã lỗi, thứ tự kiểm tra, xung đột phòng, nhập thời khóa biểu.
// Mỗi test nạp lại dữ liệu giả và cố định ngày hiện tại (thứ hai 02/11/2026), nên không phụ thuộc thứ tự chạy hay ngày chạy test.
let call;
let classSessions;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T08:00:00+07:00'));
  vi.resetModules();
  ({ classSessions } = await import('./db'));
  const { mockCall } = await import('./index');
  call = (method, path, body) => mockCall(method, path, body);
});
afterEach(() => vi.useRealTimers());
const fails = async (promise, status, code) => {
  const err = await promise.then(() => null, (e) => e);
  expect(err, `kỳ vọng lỗi ${code}`).not.toBeNull();
  expect([err.status, err.code]).toEqual([status, code]);
  return err;
};
const csvForm = (rows, semester = 'HK1 2026-2027') => {
  const fd = new FormData();
  const head = 'Học kỳ,Mã môn,Tên môn,Lớp,Thứ,Tiết bắt đầu,Số tiết,Mã phòng,Từ ngày,Đến ngày';
  fd.append('file', new File([[head, ...rows].join('\n')], 'tkb.csv', { type: 'text/csv' }));
  fd.append('semester', semester);
  fd.append('mode', 'APPEND');
  return fd;
};
const nextWeekday = (days) => {
  let d = dayjs().add(days, 'day').hour(8).minute(0).second(0);
  while (d.day() === 0 || d.day() === 6) d = d.add(1, 'day');
  return d;
};
const draft = async (over = {}) => {
  const start = nextWeekday(14);
  const { request } = await call('POST', '/requests', {
    organizationId: 'org-1', roomId: 'room-a1001', purpose: 'Sinh hoạt chuyên đề', startAt: start.format(), endAt: start.add(2, 'hour').format(), participantCount: 40, equipment: [], ...over,
  });
  return request;
};

describe('tra cứu phòng trống', () => {
  test('loại phòng đang có buổi học trong khung giờ, kể cả giao một phần', async () => {
    const s = classSessions.find((x) => x.roomCode === 'A.10.02');
    const from = dayjs(s.startAt).add(30, 'minute');
    const q = new URLSearchParams({ from: from.format(), to: from.add(1, 'hour').format(), capacity: 10 });
    const { items } = await call('GET', `/rooms/available?${q}`);
    expect(items.map((r) => r.code)).not.toContain('A.10.02');
    expect(items.length).toBeGreaterThan(0);
  });

  test('loại phòng không đủ sức chứa và phòng đang bảo trì', async () => {
    const start = nextWeekday(30);
    const q = new URLSearchParams({ from: start.format(), to: start.add(1, 'hour').format(), capacity: 100 });
    const codes = (await call('GET', `/rooms/available?${q}`)).items.map((r) => r.code);
    expect(codes).not.toContain('B.05.04');
    expect(codes).not.toContain('B.06.02');
  });

  test('giờ kết thúc sau 21:30 hoặc khác ngày thì báo VALIDATION_ERROR', async () => {
    const d = nextWeekday(30).hour(20);
    const q = new URLSearchParams({ from: d.format(), to: d.hour(22).format(), capacity: 10 });
    await fails(call('GET', `/rooms/available?${q}`), 400, 'VALIDATION_ERROR');
  });
});

describe('gửi yêu cầu', () => {
  test('gửi sát giờ sử dụng báo LEAD_TIME_VIOLATION', async () => {
    const start = dayjs().add(1, 'day').hour(8).minute(0);
    const r = await draft({ startAt: start.format(), endAt: start.add(2, 'hour').format() });
    await fails(call('POST', `/requests/${r.id}/submit`), 422, 'LEAD_TIME_VIOLATION');
  });

  test('từ 200 người mà chưa đính kèm văn bản thì báo ATTACHMENT_REQUIRED, vượt sức chứa thì CAPACITY_EXCEEDED', async () => {
    await fails(call('POST', `/requests/${(await draft({ roomId: 'room-c0301', participantCount: 220 })).id}/submit`), 422, 'ATTACHMENT_REQUIRED');
    await fails(call('POST', `/requests/${(await draft({ participantCount: 500 })).id}/submit`), 422, 'CAPACITY_EXCEEDED');
  });

  test('trùng buổi học chính khóa báo ROOM_CONFLICT kèm nguồn xung đột', async () => {
    const start = nextWeekday(21);
    classSessions.push({ id: 'ses-test', roomCode: 'D.02.01', courseCode: 'TST1', courseName: 'Thử', classCode: 'K-TEST', status: 'ACTIVE', semester: 'HK1', startAt: start.format(), endAt: start.add(3, 'hour').format() });
    const r = await draft({ roomId: 'room-d0201', startAt: start.add(1, 'hour').format(), endAt: start.add(2, 'hour').format() });
    const err = await fails(call('POST', `/requests/${r.id}/submit`), 409, 'ROOM_CONFLICT');
    expect(err.details[0]).toMatchObject({ source: 'CLASS_SCHEDULE', classCode: 'K-TEST' });
  });

  test('yêu cầu hợp lệ chuyển PENDING và sinh các bước duyệt, bước đầu đang chờ', async () => {
    const r = await draft({ roomId: 'room-d0201', startAt: nextWeekday(40).format(), endAt: nextWeekday(40).add(2, 'hour').format() });
    const { request } = await call('POST', `/requests/${r.id}/submit`);
    expect(request.status).toBe('PENDING');
    expect(request.steps.map((s) => s.status)).toEqual(['PENDING', 'WAITING']);
  });

  test('không sửa được yêu cầu đã gửi', async () => {
    const r = await draft({ roomId: 'room-d0201', startAt: nextWeekday(50).format(), endAt: nextWeekday(50).add(2, 'hour').format() });
    await call('POST', `/requests/${r.id}/submit`);
    await fails(call('PATCH', `/requests/${r.id}`, { organizationId: 'org-1', roomId: 'room-d0201', purpose: 'x', startAt: r.startAt, endAt: r.endAt, participantCount: 5 }), 409, 'INVALID_STATE');
  });
});

describe('nhập thời khóa biểu', () => {
  test('tệp có dòng sai thì IMPORT_INVALID liệt kê từng dòng và không lưu gì', async () => {
    const err = await fails(call('POST', '/class-schedule/imports', csvForm(['HK1 2026-2027,IT500,AI,K1,9,2,3,Z.99.99,03/11/2026,29/12/2026'])), 422, 'IMPORT_INVALID');
    expect(err.details.map((d) => d.column).sort()).toEqual(['Mã phòng', 'Thứ']);
    expect(err.details.every((d) => d.row === 2)).toBe(true);
  });

  test('tệp đúng tạo bản xem trước theo số tuần, xác nhận thì buổi học có hiệu lực', async () => {
    const before = classSessions.length;
    const prev = await call('POST', '/class-schedule/imports', csvForm(['HK1 2026-2027,IT500,AI,K1,3,7,3,B.06.01,03/11/2026,24/11/2026']));
    expect(prev).toMatchObject({ status: 'PREVIEW', rowCount: 1, sessionCount: 4 });
    const done = await call('POST', `/class-schedule/imports/${prev.batchId}/commit`);
    expect(done).toMatchObject({ status: 'COMMITTED', activatedSessions: 4, replacedSessions: 0 });
    expect(classSessions.length).toBe(before + 4);
    await fails(call('POST', `/class-schedule/imports/${prev.batchId}/commit`), 409, 'INVALID_STATE');
  });

  test('hủy buổi học đã hủy báo INVALID_STATE', async () => {
    const s = classSessions.find((x) => x.status === 'ACTIVE');
    await call('POST', `/class-schedule/${s.id}/cancel`);
    await fails(call('POST', `/class-schedule/${s.id}/cancel`), 409, 'INVALID_STATE');
  });
});

describe('quản lý phòng', () => {
  const room = { code: 'E.01.01', name: 'Phòng E.01.01', campus: 'Cơ sở 3', roomType: 'CLASSROOM', capacity: 50, status: 'AVAILABLE' };

  test('thêm phòng mới rồi sửa trạng thái, phòng bảo trì không còn trong kết quả tra cứu', async () => {
    const { room: created } = await call('POST', '/rooms', room);
    expect(created).toMatchObject({ code: 'E.01.01', equipment: {} });
    const start = nextWeekday(20);
    const q = new URLSearchParams({ from: start.format(), to: start.add(1, 'hour').format(), capacity: 10 });
    expect((await call('GET', `/rooms/available?${q}`)).items.map((r) => r.code)).toContain('E.01.01');
    await call('PATCH', `/rooms/${created.id}`, { ...room, status: 'MAINTENANCE' });
    expect((await call('GET', `/rooms/available?${q}`)).items.map((r) => r.code)).not.toContain('E.01.01');
  });

  test('mã phòng trùng hoặc dữ liệu thiếu thì báo VALIDATION_ERROR theo từng trường', async () => {
    const err = await fails(call('POST', '/rooms', { ...room, code: 'a.10.01', capacity: 0, name: '' }), 400, 'VALIDATION_ERROR');
    expect(err.details.map((d) => d.field).sort()).toEqual(['capacity', 'code', 'name']);
  });

  test('lọc theo trạng thái và từ khóa, có phân trang', async () => {
    const maint = await call('GET', '/rooms?status=MAINTENANCE&page=1&pageSize=5');
    expect(maint.items.map((r) => r.code)).toEqual(['B.06.02']);
    const kw = await call('GET', '/rooms?q=hội trường&page=1&pageSize=1');
    expect(kw).toMatchObject({ total: 2, pageSize: 1 });
  });

  test('sửa phòng không tồn tại báo NOT_FOUND', async () => {
    await fails(call('PATCH', '/rooms/khong-co', room), 404, 'NOT_FOUND');
  });
});
