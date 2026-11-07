import dayjs from 'dayjs';
import { ApiError } from '../errors';
import { classSessions, expandSessions, importBatches, nextId, periodSlots, requests, rooms, SEMESTER } from './db';

// Máy chủ giả cho các API chưa có ở backend: phòng, yêu cầu, lịch học chính khóa. Mã lỗi và thứ tự kiểm tra theo API Contract v1.0.
// Khi backend làm xong, đặt VITE_API_MOCK=false để màn hình gọi API thật mà không phải sửa gì khác.

const overlap = (aS, aE, bS, bE) => dayjs(aS).isBefore(bE) && dayjs(bS).isBefore(aE);
const clone = (x) => JSON.parse(JSON.stringify(x));
const paginate = (items, q) => {
  const page = Number(q.get('page')) || 1;
  const pageSize = Math.min(Number(q.get('pageSize')) || 20, 100);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length };
};
const bad = (details) => new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.', details);
const addWorkdays = (d, n) => {
  let x = d;
  for (let c = 0; c < n; ) {
    x = x.add(1, 'day');
    if (x.day() !== 0 && x.day() !== 6) c++;
  }
  return x;
};

// ---- Tra cứu phòng trống (FR-06) ----
function availableRooms(q) {
  const details = [];
  const from = dayjs(q.get('from'));
  const to = dayjs(q.get('to'));
  const capacity = Number(q.get('capacity'));
  if (!q.get('from') || !from.isValid()) details.push({ field: 'from', message: 'Chọn thời gian bắt đầu.' });
  if (!q.get('to') || !to.isValid()) details.push({ field: 'to', message: 'Chọn thời gian kết thúc.' });
  if (!capacity || capacity < 1) details.push({ field: 'capacity', message: 'Nhập số người tham dự.' });
  if (!details.length) {
    if (!to.isAfter(from) || !to.isSame(from, 'day')) details.push({ field: 'to', message: 'Giờ kết thúc phải sau giờ bắt đầu và trong cùng ngày.' });
    else if (to.hour() * 60 + to.minute() > 21 * 60 + 30) details.push({ field: 'to', message: 'Giờ kết thúc không muộn hơn 21:30.' });
  }
  if (details.length) throw bad(details);
  const need = (q.get('equipment') || '').split(',').filter(Boolean).map((p) => p.split(':'));
  const items = rooms
    .filter((r) => r.status === 'AVAILABLE' && r.capacity >= capacity)
    .filter((r) => !q.get('campus') || r.campus === q.get('campus'))
    .filter((r) => !q.get('roomType') || r.roomType === q.get('roomType'))
    .filter((r) => need.every(([type, qty]) => (r.equipment[type] || 0) >= Number(qty || 1)))
    .filter((r) => !classSessions.some((s) => s.status === 'ACTIVE' && s.roomCode === r.code && overlap(s.startAt, s.endAt, from, to)))
    .filter((r) => !requests.some((x) => x.status === 'APPROVED' && x.room.code === r.code && overlap(x.startAt, x.endAt, from, to)))
    .map(({ status, ...r }) => r);
  return paginate(items, q);
}

// ---- Yêu cầu sử dụng phòng (FR-07, FR-08) ----
function validateRequest(b) {
  const details = [];
  if (!b.organizationId) details.push({ field: 'organizationId', message: 'Chọn đơn vị đăng ký.' });
  if (!b.roomId || !rooms.some((r) => r.id === b.roomId)) details.push({ field: 'roomId', message: 'Chọn phòng.' });
  if (!b.purpose || !String(b.purpose).trim()) details.push({ field: 'purpose', message: 'Nhập mục đích sử dụng.' });
  if (!b.startAt || !b.endAt || !dayjs(b.endAt).isAfter(b.startAt)) details.push({ field: 'startAt', message: 'Chọn khoảng thời gian hợp lệ.' });
  if (!Number.isInteger(b.participantCount) || b.participantCount < 1) details.push({ field: 'participantCount', message: 'Nhập số người tham dự.' });
  (b.equipment || []).forEach((e, i) => {
    if (e.itemType === 'OTHER' && !String(e.otherDescription || '').trim()) details.push({ field: `equipment.${i}.otherDescription`, message: 'Mô tả thiết bị khác.' });
  });
  if (details.length) throw bad(details);
}

const findRequest = (id) => {
  const r = requests.find((x) => x.id === id);
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu.');
  return r;
};

function saveRequest(r, b) {
  const room = rooms.find((x) => x.id === b.roomId);
  Object.assign(r, {
    organizationId: b.organizationId,
    room: { id: room.id, code: room.code, name: room.name, capacity: room.capacity },
    purpose: String(b.purpose).trim(),
    startAt: b.startAt,
    endAt: b.endAt,
    participantCount: b.participantCount,
    equipment: b.equipment || [],
  });
  return r;
}

function submitRequest(r) {
  if (r.status !== 'DRAFT') throw new ApiError(409, 'INVALID_STATE', 'Chỉ gửi được yêu cầu đang ở trạng thái nháp.');
  const start = dayjs(r.startAt);
  const end = dayjs(r.endAt);
  const room = rooms.find((x) => x.id === r.room.id);
  if (start.isBefore(addWorkdays(dayjs(), 3))) throw new ApiError(422, 'LEAD_TIME_VIOLATION', 'Phải gửi yêu cầu trước giờ sử dụng ít nhất 3 ngày làm việc.');
  if (!end.isSame(start, 'day') || end.hour() * 60 + end.minute() > 21 * 60 + 30) throw new ApiError(422, 'AFTER_HOURS_LIMIT', 'Thời gian kết thúc không được muộn hơn 21:30 cùng ngày.');
  if (room.status !== 'AVAILABLE') throw new ApiError(409, 'ROOM_UNAVAILABLE', `Phòng ${room.code} hiện không khả dụng.`);
  if (r.participantCount > room.capacity) throw new ApiError(422, 'CAPACITY_EXCEEDED', `Số người tham dự vượt sức chứa của phòng ${room.code} (${room.capacity} chỗ).`);
  if (r.participantCount >= 200 && !(r.attachments || []).length) throw new ApiError(422, 'ATTACHMENT_REQUIRED', 'Hoạt động từ 200 người trở lên cần đính kèm văn bản của Ban Giám hiệu.');
  const cls = classSessions.find((s) => s.status === 'ACTIVE' && s.roomCode === room.code && overlap(s.startAt, s.endAt, start, end));
  if (cls) {
    throw new ApiError(409, 'ROOM_CONFLICT', `Phòng ${room.code} đã có lớp học trong khung giờ này.`, [{ source: 'CLASS_SCHEDULE', courseCode: cls.courseCode, classCode: cls.classCode }]);
  }
  const bk = requests.find((x) => x.status === 'APPROVED' && x.room.code === room.code && overlap(x.startAt, x.endAt, start, end));
  if (bk) throw new ApiError(409, 'ROOM_CONFLICT', `Phòng ${room.code} đã có lượt đặt được duyệt trong khung giờ này.`, [{ source: 'ROOM_BOOKING', requestCode: bk.code }]);
  const names = ['Phòng Đào tạo', ...(r.participantCount >= 200 ? ['Ban Giám hiệu'] : []), 'Phòng Quản trị cơ sở vật chất'];
  r.steps = names.map((organizationName, i) => ({ order: i + 1, organizationName, status: i === 0 ? 'PENDING' : 'WAITING' }));
  r.status = 'PENDING';
  r.submittedAt = dayjs().format();
  return r;
}

// ---- Lịch học chính khóa (FR-23) ----
const parseCsv = (text) => {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const delim = lines[0] && lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  return lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, '')));
};
const parseDate = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || '');
  if (!m) return null;
  const d = dayjs(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  return d.isValid() && d.date() === Number(m[1]) ? d : null;
};

async function createImport(form) {
  const file = form.get('file');
  const semester = String(form.get('semester') || '').trim();
  const mode = form.get('mode') === 'REPLACE' ? 'REPLACE' : 'APPEND';
  if (!file || !semester) throw bad([{ field: file ? 'semester' : 'file', message: file ? 'Nhập học kỳ.' : 'Chọn tệp thời khóa biểu.' }]);
  if (file.size > 5 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn 5 MB.');
  if (!/\.csv$/i.test(file.name)) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Bản chạy thử chỉ đọc tệp CSV. Hãy lưu tệp Excel thành CSV rồi tải lên.');
  const rows = parseCsv(await file.text()).slice(1);
  const errors = [];
  const parsed = [];
  rows.forEach((c, i) => {
    const line = i + 2;
    const err = (column, message) => errors.push({ row: line, column, message });
    const [sem, courseCode, courseName, classCode, weekday, period, count, roomCode, fromS, toS] = c;
    if (sem !== semester) err('Học kỳ', `Phải trùng học kỳ đã chọn (${semester}).`);
    if (!courseCode) err('Mã môn', 'Không để trống.');
    if (!courseName) err('Tên môn', 'Không để trống.');
    if (!classCode) err('Lớp', 'Không để trống.');
    const wd = Number(weekday);
    if (!Number.isInteger(wd) || wd < 2 || wd > 8) err('Thứ', 'Số từ 2 đến 8.');
    const p = Number(period);
    const n = Number(count);
    if (!Number.isInteger(p) || p < 1 || p > periodSlots.length) err('Tiết bắt đầu', 'Không có trong bảng khung tiết.');
    if (!Number.isInteger(n) || n < 1 || p + n - 1 > periodSlots.length) err('Số tiết', 'Số nguyên dương và tiết cuối phải có trong bảng khung tiết.');
    if (!rooms.some((r) => r.code === roomCode)) err('Mã phòng', 'Không có trong hệ thống.');
    const from = parseDate(fromS);
    const to = parseDate(toS);
    if (!from) err('Từ ngày', 'Định dạng dd/mm/yyyy.');
    if (!to) err('Đến ngày', 'Định dạng dd/mm/yyyy.');
    if (from && to && to.isBefore(from)) err('Đến ngày', 'Không trước Từ ngày.');
    if (!errors.some((e) => e.row === line)) parsed.push({ weekday: wd, period: p, count: n, roomCode, courseCode, courseName, classCode, from, to, semester, line });
  });
  if (!rows.length) errors.push({ row: 1, column: '', message: 'Tệp không có dòng dữ liệu nào.' });
  const sessions = parsed.flatMap((p) => expandSessions(p, () => nextId('ses')).map((s) => ({ ...s, status: 'PENDING', line: p.line })));
  // Hai lớp trong cùng tệp không được chồng giờ trên một phòng.
  sessions.forEach((a, i) => {
    const b = sessions.slice(i + 1).find((x) => x.roomCode === a.roomCode && x.line !== a.line && overlap(a.startAt, a.endAt, x.startAt, x.endAt));
    if (b && !errors.some((e) => e.row === b.line && e.column === 'Mã phòng')) errors.push({ row: b.line, column: 'Mã phòng', message: `Trùng giờ với dòng ${a.line} (${a.classCode}) trên phòng ${a.roomCode}.` });
  });
  if (errors.length) throw new ApiError(422, 'IMPORT_INVALID', 'Tệp thời khóa biểu có dòng lỗi, không lưu dòng nào.', errors);
  const batch = { id: nextId('batch'), status: 'PREVIEW', semester, mode, fileName: file.name, rowCount: rows.length, sessionCount: sessions.length, sessions, createdAt: dayjs().format() };
  importBatches.unshift(batch);
  return previewOf(batch);
}

const conflictsOf = (batch) => {
  const out = [];
  requests
    .filter((r) => ['PENDING', 'APPROVED'].includes(r.status))
    .forEach((r) => {
      const s = batch.sessions.find((x) => x.roomCode === r.room.code && overlap(x.startAt, x.endAt, r.startAt, r.endAt));
      if (s) out.push({ requestId: r.id, requestCode: r.code, requesterName: r.requesterName, roomCode: r.room.code, startAt: r.startAt, endAt: r.endAt, requestStatus: r.status, conflictWith: { courseCode: s.courseCode, classCode: s.classCode } });
    });
  return out;
};
const previewOf = (b) => ({ batchId: b.id, status: b.status, semester: b.semester, mode: b.mode, rowCount: b.rowCount, sessionCount: b.sessionCount, conflicts: conflictsOf(b) });
const findBatch = (id) => {
  const b = importBatches.find((x) => x.id === id);
  if (!b) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy lần nhập.');
  return b;
};
const needPreview = (b) => {
  if (b.status !== 'PREVIEW') throw new ApiError(409, 'INVALID_STATE', 'Lần nhập này không còn ở trạng thái xem trước.');
  return b;
};

function commitImport(b) {
  needPreview(b);
  const conflicts = conflictsOf(b);
  let replaced = 0;
  if (b.mode === 'REPLACE') {
    classSessions.forEach((s) => {
      if (s.semester === b.semester && s.status === 'ACTIVE') {
        s.status = 'CANCELLED';
        replaced++;
      }
    });
  }
  b.sessions.forEach((s) => classSessions.push({ ...s, status: 'ACTIVE' }));
  const cancelledRequests = conflicts.map((c) => {
    const r = requests.find((x) => x.id === c.requestId);
    r.status = 'CANCELLED';
    r.cancelReason = `Phòng ${c.roomCode} có lớp ${c.conflictWith.courseCode} (${c.conflictWith.classCode}) theo thời khóa biểu mới của Phòng Đào tạo.`;
    return { id: r.id, requestCode: r.code, requesterName: r.requesterName, cancelReason: r.cancelReason };
  });
  b.status = 'COMMITTED';
  return { batchId: b.id, status: 'COMMITTED', activatedSessions: b.sessions.length, replacedSessions: replaced, cancelledRequests };
}

function listSessions(q) {
  const from = q.get('from') && dayjs(q.get('from'));
  const to = q.get('to') && dayjs(q.get('to'));
  const items = classSessions
    .filter((s) => !q.get('roomCode') || s.roomCode === q.get('roomCode'))
    .filter((s) => !q.get('status') || s.status === q.get('status'))
    .filter((s) => !from || !dayjs(s.startAt).isBefore(from, 'day'))
    .filter((s) => !to || !dayjs(s.startAt).isAfter(to, 'day'))
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.roomCode.localeCompare(b.roomCode));
  return paginate(items, q);
}

function updateSession(id, b) {
  const s = classSessions.find((x) => x.id === id);
  if (!s) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy buổi học.');
  if (s.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'Chỉ sửa được buổi học đang hiệu lực.');
  const next = { roomCode: b.roomCode || s.roomCode, startAt: b.startAt || s.startAt, endAt: b.endAt || s.endAt };
  if (!rooms.some((r) => r.code === next.roomCode)) throw bad([{ field: 'roomCode', message: 'Phòng không tồn tại.' }]);
  if (!dayjs(next.endAt).isAfter(next.startAt)) throw bad([{ field: 'endAt', message: 'Giờ kết thúc phải sau giờ bắt đầu.' }]);
  const other = classSessions.find((x) => x.id !== s.id && x.status === 'ACTIVE' && x.roomCode === next.roomCode && overlap(x.startAt, x.endAt, next.startAt, next.endAt));
  if (other) throw new ApiError(409, 'ROOM_CONFLICT', `Phòng ${next.roomCode} đã có lớp học trong khung giờ này.`, [{ source: 'CLASS_SCHEDULE', courseCode: other.courseCode, classCode: other.classCode }]);
  Object.assign(s, next);
  return s;
}

const route = (method, pattern, handler) => ({ method, re: new RegExp(`^${pattern}$`), handler });
const routes = [
  route('GET', '/rooms/available', (m, q) => availableRooms(q)),
  route('GET', '/rooms', () => ({ items: rooms, total: rooms.length, page: 1, pageSize: rooms.length })),
  route('GET', '/period-slots', () => ({ items: periodSlots })),
  route('POST', '/requests', (m, q, b) => {
    validateRequest(b);
    const n = requests.length + 1;
    const r = { id: nextId('req'), code: `REQ-${String(n).padStart(3, '0')}`, status: 'DRAFT', requesterName: b.requesterName || 'Người đăng ký', attachments: [], steps: [], createdAt: dayjs().format() };
    requests.push(r);
    return { request: saveRequest(r, b) };
  }),
  route('GET', '/requests/([^/]+)', (m) => ({ request: findRequest(m[1]) })),
  route('PATCH', '/requests/([^/]+)', (m, q, b) => {
    const r = findRequest(m[1]);
    if (r.status !== 'DRAFT') throw new ApiError(409, 'INVALID_STATE', 'Chỉ sửa được yêu cầu đang ở trạng thái nháp.');
    validateRequest(b);
    return { request: saveRequest(r, b) };
  }),
  route('POST', '/requests/([^/]+)/attachments', (m, q, b) => {
    const r = findRequest(m[1]);
    const file = b instanceof FormData && b.get('file');
    if (!file) throw bad([{ field: 'file', message: 'Chọn tệp đính kèm.' }]);
    if (file.size > 5 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn 5 MB.');
    if (!/\.(pdf|docx?|png|jpe?g)$/i.test(file.name)) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Chỉ nhận tệp PDF, Word hoặc ảnh.');
    r.attachments.push({ id: nextId('att'), fileName: file.name, size: file.size });
    return { request: r };
  }),
  route('POST', '/requests/([^/]+)/submit', (m) => ({ request: submitRequest(findRequest(m[1])) })),
  route('POST', '/class-schedule/imports', (m, q, b) => createImport(b)),
  route('GET', '/class-schedule/imports', (m, q) => paginate(importBatches.map(({ sessions, ...b }) => b), q)),
  route('GET', '/class-schedule/imports/([^/]+)', (m) => previewOf(findBatch(m[1]))),
  route('POST', '/class-schedule/imports/([^/]+)/commit', (m) => commitImport(findBatch(m[1]))),
  route('DELETE', '/class-schedule/imports/([^/]+)', (m) => {
    needPreview(findBatch(m[1])).status = 'DISCARDED';
    return null;
  }),
  route('GET', '/class-schedule', (m, q) => listSessions(q)),
  route('PATCH', '/class-schedule/([^/]+)', (m, q, b) => ({ session: updateSession(m[1], b) })),
  route('POST', '/class-schedule/([^/]+)/cancel', (m) => {
    const s = classSessions.find((x) => x.id === m[1]);
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy buổi học.');
    if (s.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'Chỉ hủy được buổi học đang hiệu lực.');
    s.status = 'CANCELLED';
    return { session: s };
  }),
];

const split = (path) => {
  const [p, qs = ''] = path.split('?');
  return [p, new URLSearchParams(qs)];
};
const match = (method, path) => {
  const [p, q] = split(path);
  for (const r of routes) {
    const m = r.method === method && r.re.exec(p);
    if (m) return { r, m, q };
  }
  return null;
};

export const mockHandles = (method, path) => Boolean(match(method, path));

export async function mockCall(method, path, body) {
  const { r, m, q } = match(method, path);
  await new Promise((res) => setTimeout(res, 250));
  const out = await r.handler(m, q, body);
  return out === null ? null : clone(out);
}

export { SEMESTER };
