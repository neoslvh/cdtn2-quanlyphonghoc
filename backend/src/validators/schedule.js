const { ApiError } = require('../errors');
const { validation } = require('../http');
const { fromVN } = require('../timeVN');

// Tầng validator cho thời khóa biểu: kiểm tra định dạng từng dòng của tệp (API Contract bảng 1.9) và tham số các API lịch học.
const COLUMNS = ['Học kỳ', 'Mã môn', 'Tên môn', 'Lớp', 'Thứ', 'Tiết bắt đầu', 'Số tiết', 'Mã phòng', 'Từ ngày', 'Đến ngày'];
const MAX_SPAN_DAYS = 370;
const DAY_MS = 24 * 3600 * 1000;

const norm = (s) => String(s || '').trim().toLowerCase();

function parseDate(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text || '');
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? { y, m: mo, d, utc: date } : null;
}

/**
 * Kiểm tra các dòng đọc từ tệp. Nhận: rows (dòng đầu là tiêu đề), semester, slots (Map tiết -> giờ), roomCodes (Set mã phòng).
 * Trả: { parsed: [dòng hợp lệ], errors: [{ row, column, message }] }. row đánh số như trong Excel (dòng tiêu đề là 1).
 */
function checkRows(rows, { semester, slots, roomCodes }) {
  const errors = [];
  const parsed = [];
  const header = rows[0] || [];
  if (COLUMNS.some((c, i) => norm(header[i]) !== norm(c))) {
    errors.push({ row: 1, column: '', message: `Dòng tiêu đề phải đúng 10 cột theo tệp mẫu: ${COLUMNS.join(', ')}.` });
    return { parsed, errors };
  }
  if (rows.length < 2) errors.push({ row: 1, column: '', message: 'Tệp không có dòng dữ liệu nào.' });
  rows.slice(1).forEach((c, i) => {
    const row = i + 2;
    const before = errors.length;
    const err = (column, message) => errors.push({ row, column, message });
    const [sem, courseCode, courseName, classCode, weekdayText, periodText, countText, roomCode, fromText, toText] = c;
    if (sem !== semester) err('Học kỳ', `Phải trùng học kỳ đã chọn (${semester}).`);
    if (!courseCode) err('Mã môn', 'Không để trống.');
    else if (courseCode.length > 50) err('Mã môn', 'Tối đa 50 ký tự.');
    if (!courseName) err('Tên môn', 'Không để trống.');
    else if (courseName.length > 200) err('Tên môn', 'Tối đa 200 ký tự.');
    if (!classCode) err('Lớp', 'Không để trống.');
    else if (classCode.length > 50) err('Lớp', 'Tối đa 50 ký tự.');
    const weekday = Number(weekdayText);
    if (!Number.isInteger(weekday) || weekday < 2 || weekday > 8) err('Thứ', 'Số từ 2 đến 8 (2 là thứ hai, 8 là chủ nhật).');
    const period = Number(periodText);
    const count = Number(countText);
    if (!Number.isInteger(period) || !slots.has(period)) err('Tiết bắt đầu', 'Không có trong bảng khung tiết.');
    if (!Number.isInteger(count) || count < 1 || (slots.has(period) && !slots.has(period + count - 1))) err('Số tiết', 'Số nguyên dương và tiết cuối phải có trong bảng khung tiết.');
    if (!roomCodes.has(roomCode)) err('Mã phòng', 'Không có trong hệ thống.');
    const from = parseDate(fromText);
    const to = parseDate(toText);
    if (!from) err('Từ ngày', 'Định dạng dd/mm/yyyy.');
    if (!to) err('Đến ngày', 'Định dạng dd/mm/yyyy.');
    if (from && to && to.utc < from.utc) err('Đến ngày', 'Không trước Từ ngày.');
    else if (from && to && (to.utc - from.utc) / DAY_MS > MAX_SPAN_DAYS) err('Đến ngày', `Một dòng chỉ trải tối đa ${MAX_SPAN_DAYS} ngày.`);
    if (errors.length === before) parsed.push({ row, courseCode, courseName, classCode, weekday, period, count, roomCode, from, to });
  });
  return { parsed, errors };
}

/**
 * Trải mỗi dòng thành các buổi học theo từng tuần giữa Từ ngày và Đến ngày, đổi tiết sang giờ theo bảng khung tiết (giờ Việt Nam).
 * slots: Map tiết -> { start: [h, mi], end: [h, mi] }. Trả mảng { row, roomCode, courseCode, courseName, classCode, startAt, endAt }.
 */
function expandSessions(parsed, slots) {
  const out = [];
  for (const p of parsed) {
    const target = p.weekday === 8 ? 0 : p.weekday - 1;
    const [sh, sm] = slots.get(p.period).start;
    const [eh, em] = slots.get(p.period + p.count - 1).end;
    for (let t = p.from.utc.getTime(); t <= p.to.utc.getTime(); t += DAY_MS) {
      const d = new Date(t);
      if (d.getUTCDay() !== target) continue;
      const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      out.push({ row: p.row, roomCode: p.roomCode, courseCode: p.courseCode, courseName: p.courseName, classCode: p.classCode, startAt: fromVN(y, m, day, sh, sm), endAt: fromVN(y, m, day, eh, em) });
    }
  }
  return out;
}

/** Hai lớp trong cùng tệp không được chồng giờ trên một phòng. Trả thêm lỗi cho dòng đến sau. */
function checkInternalOverlap(sessions) {
  const errors = [];
  const byRoom = new Map();
  for (const s of sessions) {
    const list = byRoom.get(s.roomCode) || [];
    const hit = list.find((x) => x.row !== s.row && x.startAt < s.endAt && s.startAt < x.endAt);
    if (hit && !errors.some((e) => e.row === s.row)) errors.push({ row: s.row, column: 'Mã phòng', message: `Trùng giờ với dòng ${hit.row} (${hit.classCode}) trên phòng ${s.roomCode}.` });
    list.push(s);
    byRoom.set(s.roomCode, list);
  }
  return errors;
}

/** Tham số tạo lần nhập: học kỳ và chế độ. */
function checkImportParams({ semester, mode }) {
  const details = [];
  const sem = typeof semester === 'string' ? semester.trim() : '';
  if (!sem) details.push({ field: 'semester', message: 'Nhập học kỳ.' });
  else if (sem.length > 30) details.push({ field: 'semester', message: 'Học kỳ tối đa 30 ký tự.' });
  if (!['APPEND', 'REPLACE'].includes(mode)) details.push({ field: 'mode', message: 'Chế độ nhập là APPEND hoặc REPLACE.' });
  if (details.length) throw validation(details);
  return { semester: sem, mode };
}

/** Sửa một buổi học: phòng, giờ bắt đầu, giờ kết thúc (đều tùy chọn nhưng phải có ít nhất một). */
function checkSessionPatch(b) {
  const details = [];
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
  const date = (v) => (typeof v === 'string' && ISO.test(v) && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null);
  const out = {};
  if (b.roomCode !== undefined) {
    if (typeof b.roomCode !== 'string' || !b.roomCode.trim()) details.push({ field: 'roomCode', message: 'Chọn phòng.' });
    else out.roomCode = b.roomCode.trim();
  }
  for (const f of ['startAt', 'endAt']) {
    if (b[f] === undefined) continue;
    const d = date(b[f]);
    if (!d) details.push({ field: f, message: 'Thời gian dạng ISO 8601 có múi giờ.' });
    else out[f] = d;
  }
  if (!Object.keys(out).length && !details.length) details.push({ field: 'roomCode', message: 'Không có trường nào để cập nhật.' });
  if (details.length) throw validation(details);
  return out;
}

const importInvalid = (errors) => new ApiError(422, 'IMPORT_INVALID', 'Tệp thời khóa biểu có dòng lỗi, không lưu dòng nào.', errors);

module.exports = { COLUMNS, parseDate, checkRows, expandSessions, checkInternalOverlap, checkImportParams, checkSessionPatch, importInvalid };
