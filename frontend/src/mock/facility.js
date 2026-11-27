import dayjs from 'dayjs';
import { ApiError } from '../errors';
import { nextId, requests, rooms } from './db';

// Máy chủ giả cho các API backend chưa làm: thiết bị và QR (FR-04, FR-05), lịch phòng (FR-11), bàn giao (FR-17),
// check-in (FR-18), báo hỏng (FR-19), bảo trì (FR-20), quy tắc duyệt (FR-16), báo cáo (FR-22).
// Đường dẫn và mã lỗi theo API Contract v1.0, cột dữ liệu theo ERD v4.1. Backend làm xong thì giao diện gọi API thật.

const PREFIX = { PROJECTOR: 'PJ', MICROPHONE: 'MIC', AUDIO: 'AU', AIR_CONDITIONER: 'AC' };
const NAME = { PROJECTOR: 'Máy chiếu', MICROPHONE: 'Micro', AUDIO: 'Loa', AIR_CONDITIONER: 'Máy lạnh' };
export const EQUIPMENT_TYPES = Object.keys(PREFIX);
const STATUSES = ['GOOD', 'BROKEN', 'MAINTENANCE'];

const roomToken = (r) => `qr-room-${r.code}`;
// Thiết bị sinh từ số lượng thiết bị của từng phòng trong dữ liệu giả.
export const equipment = rooms.flatMap((r) =>
  Object.entries(r.equipment).flatMap(([type, n]) =>
    Array.from({ length: n }, (_, i) => ({
      id: nextId('eq'),
      assetCode: `${PREFIX[type]}-${r.code.replace(/\./g, '')}-${i + 1}`,
      name: `${NAME[type]} ${i + 1}`,
      equipmentType: type,
      status: 'GOOD',
      roomId: r.id,
      qrToken: `qr-eq-${r.code}-${type}-${i + 1}`,
    })),
  ),
);
export const incidents = [];
export const tickets = [];
export const approvalRules = [
  { id: 'rule-1', code: 'PDT_HANH_CHINH', name: 'Giờ hành chính do Phòng Đào tạo xác nhận', priority: 10, condition: { timeFrom: '07:00', timeTo: '18:00' }, targetOrg: { id: null, name: 'Phòng Đào tạo' }, active: true },
  { id: 'rule-2', code: 'TTHTSV_BUOI_TOI', name: 'Sau 18:00 do Trung tâm Hỗ trợ Sinh viên xác nhận', priority: 20, condition: { timeFrom: '18:00', timeTo: '21:30' }, targetOrg: { id: null, name: 'Trung tâm Hỗ trợ Sinh viên' }, active: true },
  { id: 'rule-3', code: 'BGH_TU_200', name: 'Từ 200 người cần Ban Giám hiệu phê duyệt', priority: 30, condition: { minParticipants: 200 }, targetOrg: { id: null, name: 'Ban Giám hiệu' }, active: true },
];

const bad = (details) => new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.', details);
const notFound = (what) => new ApiError(404, 'NOT_FOUND', `Không tìm thấy ${what}.`);
const invalid = (msg) => new ApiError(409, 'INVALID_STATE', msg);
const paginate = (items, q) => {
  const page = Number(q.get('page')) || 1;
  const pageSize = Math.min(Number(q.get('pageSize')) || 20, 100);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length };
};
const roomOf = (id) => rooms.find((r) => r.id === id);
const findReq = (id) => requests.find((r) => r.id === id) || (() => { throw notFound('yêu cầu'); })();
const findEq = (id) => equipment.find((e) => e.id === id) || (() => { throw notFound('thiết bị'); })();

const toEquipment = (e) => {
  const r = e.roomId ? roomOf(e.roomId) : null;
  return { id: e.id, assetCode: e.assetCode, name: e.name, equipmentType: e.equipmentType, status: e.status, qrToken: e.qrToken, room: r ? { id: r.id, code: r.code } : null };
};

// Ảnh QR giả dạng SVG ghi chuỗi token, đủ để xem bố cục và in thử. Máy chủ thật trả ảnh QR quét được.
const qrImage = (token, label) =>
  new Blob(
    [`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280"><rect width="280" height="280" fill="#fff" stroke="#101129" stroke-width="8"/><rect x="24" y="24" width="64" height="64" fill="#101129"/><rect x="192" y="24" width="64" height="64" fill="#101129"/><rect x="24" y="192" width="64" height="64" fill="#101129"/><text x="140" y="140" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#101129">${label}</text><text x="140" y="164" font-family="monospace" font-size="10" text-anchor="middle" fill="#797a97">${token}</text></svg>`],
    { type: 'image/svg+xml' },
  );

function saveEquipment(e, b) {
  const details = [];
  const code = String(b.assetCode || '').trim();
  if (!code) details.push({ field: 'assetCode', message: 'Nhập mã tài sản.' });
  else if (code.length > 50) details.push({ field: 'assetCode', message: 'Mã tài sản tối đa 50 ký tự.' });
  else if (equipment.some((x) => x.id !== e.id && x.assetCode.toLowerCase() === code.toLowerCase())) details.push({ field: 'assetCode', message: 'Mã tài sản đã tồn tại.' });
  if (!String(b.name || '').trim()) details.push({ field: 'name', message: 'Nhập tên thiết bị.' });
  if (!EQUIPMENT_TYPES.includes(b.equipmentType)) details.push({ field: 'equipmentType', message: 'Chọn loại thiết bị.' });
  if (!STATUSES.includes(b.status)) details.push({ field: 'status', message: 'Chọn tình trạng.' });
  if (b.roomId && !roomOf(b.roomId)) details.push({ field: 'roomId', message: 'Phòng không tồn tại.' });
  if (details.length) throw bad(details);
  Object.assign(e, { assetCode: code, name: String(b.name).trim(), equipmentType: b.equipmentType, status: b.status, roomId: b.roomId || null });
  return e;
}

const toIncident = (i) => {
  const r = findReq(i.requestId);
  const e = findEq(i.equipmentId);
  const t = tickets.find((x) => x.incidentId === i.id);
  return { id: i.id, createdAt: i.createdAt, description: i.description, imageName: i.imageName, status: i.status, reporterName: r.requesterName, request: { id: r.id, code: r.code }, room: { code: r.room.code }, equipment: { id: e.id, assetCode: e.assetCode, name: e.name }, ticket: t ? { id: t.id, status: t.status, note: t.note } : null };
};

export function facilityRoutes(route) {
  return [
    // ---- Thiết bị và QR
    route('GET', '/equipment', (m, q) => {
      const kw = (q.get('q') || '').trim().toLowerCase();
      const items = equipment
        .filter((e) => (!q.get('roomId') || e.roomId === q.get('roomId')) && (!q.get('equipmentType') || e.equipmentType === q.get('equipmentType')) && (!q.get('status') || e.status === q.get('status')))
        .filter((e) => !kw || `${e.assetCode} ${e.name}`.toLowerCase().includes(kw))
        .map(toEquipment);
      return paginate(items, q);
    }),
    route('POST', '/equipment', (m, q, b) => {
      const e = saveEquipment({ id: nextId('eq'), qrToken: `qr-eq-${Date.now().toString(36)}` }, b || {});
      equipment.push(e);
      return { equipment: toEquipment(e) };
    }),
    route('GET', '/equipment/([^/]+)/qr', (m) => {
      const e = findEq(m[1]);
      return qrImage(e.qrToken, e.assetCode);
    }),
    route('GET', '/equipment/([^/]+)', (m) => ({ equipment: toEquipment(findEq(m[1])) })),
    route('PATCH', '/equipment/([^/]+)', (m, q, b) => ({ equipment: toEquipment(saveEquipment(findEq(m[1]), b || {})) })),
    route('GET', '/rooms/([^/]+)/qr', (m) => {
      const r = roomOf(m[1]);
      if (!r) throw notFound('phòng');
      return qrImage(roomToken(r), r.code);
    }),
    route('GET', '/qr/([^/]+)', (m) => {
      const token = decodeURIComponent(m[1]);
      const r = rooms.find((x) => roomToken(x) === token);
      if (r) return { type: 'ROOM', room: { id: r.id, code: r.code, name: r.name, status: r.status } };
      const e = equipment.find((x) => x.qrToken === token);
      if (e) return { type: 'EQUIPMENT', equipment: toEquipment(e) };
      throw notFound('mã QR');
    }),
    // ---- Lịch đã duyệt của phòng (FR-11), đặt sau /rooms/{id}/qr để không bắt nhầm
    route('GET', '/rooms/([^/]+)/bookings', (m, q) => {
      if (!roomOf(m[1])) throw notFound('phòng');
      const from = q.get('from') ? dayjs(q.get('from')) : null;
      const to = q.get('to') ? dayjs(q.get('to')) : null;
      const items = requests
        .filter((r) => r.status === 'APPROVED' && r.room.id === m[1])
        .filter((r) => (!from || dayjs(r.endAt).isAfter(from)) && (!to || dayjs(r.startAt).isBefore(to)))
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
        .map((r) => ({ requestId: r.id, requestCode: r.code, startAt: r.startAt, endAt: r.endAt, purpose: r.purpose, requesterName: r.requesterName }));
      return { items };
    }),
    // Chi tiết phòng kèm danh sách thiết bị, dùng cho ô chọn thiết bị khi báo hỏng.
    route('GET', '/rooms/([^/]+)', (m) => {
      const r = roomOf(m[1]);
      if (!r) throw notFound('phòng');
      return { room: { ...r, equipmentItems: equipment.filter((e) => e.roomId === r.id).map(toEquipment) } };
    }),

    // ---- Check-in bằng QR (FR-18, API Contract 1.5.6)
    route('POST', '/requests/([^/]+)/checkin', (m, q, b) => {
      const r = findReq(m[1]);
      if (r.status !== 'APPROVED') throw invalid('Chỉ check-in được yêu cầu đã duyệt.');
      if (r.checkin) throw invalid('Yêu cầu này đã check-in.');
      const token = String((b && b.qrToken) || '').trim();
      if (!token) throw bad([{ field: 'qrToken', message: 'Quét hoặc nhập mã QR của phòng.' }]);
      if (token !== roomToken(roomOf(r.room.id))) throw invalid(`Mã QR không phải của phòng ${r.room.code}.`);
      const now = dayjs();
      if (now.isBefore(dayjs(r.startAt).subtract(15, 'minute')) || now.isAfter(r.endAt)) throw invalid('Chỉ check-in được trong khung giờ đã duyệt (sớm nhất 15 phút trước giờ bắt đầu).');
      r.checkin = { checkedInAt: now.format(), result: 'SUCCESS' };
      return { request: r };
    }),

    // ---- Bàn giao và nhận trả (FR-17)
    route('POST', '/requests/([^/]+)/handover', (m, q, b) => {
      const r = findReq(m[1]);
      if (r.status !== 'APPROVED') throw invalid('Chỉ bàn giao yêu cầu đã duyệt.');
      if (r.handover) throw invalid('Yêu cầu này đã được bàn giao.');
      r.handover = { handedOverAt: dayjs().format(), handedOverBy: 'Nhân viên cơ sở vật chất', conditionNote: String((b && b.conditionNote) || '').trim() || null, returnedAt: null, returnNote: null };
      return { request: r };
    }),
    route('POST', '/requests/([^/]+)/return', (m, q, b) => {
      const r = findReq(m[1]);
      if (!r.handover) throw invalid('Yêu cầu chưa được bàn giao.');
      if (r.handover.returnedAt) throw invalid('Yêu cầu này đã nhận trả.');
      Object.assign(r.handover, { returnedAt: dayjs().format(), returnNote: String((b && b.conditionNote) || '').trim() || null });
      return { request: r };
    }),

    // ---- Báo hỏng (FR-19) và bảo trì (FR-20)
    route('POST', '/incidents', (m, q, b) => {
      const get = (k) => (b instanceof FormData ? b.get(k) : b && b[k]);
      const details = [];
      const r = requests.find((x) => x.id === get('requestId'));
      if (!r) details.push({ field: 'requestId', message: 'Yêu cầu không tồn tại.' });
      const e = equipment.find((x) => x.id === get('equipmentId'));
      if (!e) details.push({ field: 'equipmentId', message: 'Chọn thiết bị bị hỏng.' });
      const description = String(get('description') || '').trim();
      if (!description) details.push({ field: 'description', message: 'Mô tả tình trạng hỏng.' });
      const image = get('image');
      if (image && image.size > 5 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn 5 MB.');
      if (image && !/\.(png|jpe?g)$/i.test(image.name)) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Ảnh minh chứng chỉ nhận PNG hoặc JPG.');
      if (details.length) throw bad(details);
      if (r.status !== 'APPROVED') throw invalid('Chỉ báo hỏng trong yêu cầu đã duyệt.');
      if (e.roomId !== r.room.id) throw bad([{ field: 'equipmentId', message: `Thiết bị không thuộc phòng ${r.room.code}.` }]);
      e.status = 'BROKEN';
      const i = { id: nextId('inc'), requestId: r.id, equipmentId: e.id, description, imageName: image ? image.name : null, status: 'OPEN', createdAt: dayjs().format() };
      incidents.push(i);
      return { incident: toIncident(i) };
    }),
    route('GET', '/incidents', (m, q) => paginate(incidents.filter((i) => !q.get('status') || i.status === q.get('status')).slice().reverse().map(toIncident), q)),
    route('POST', '/maintenance-tickets', (m, q, b) => {
      const i = incidents.find((x) => x.id === (b && b.incidentId));
      if (!i) throw bad([{ field: 'incidentId', message: 'Báo hỏng không tồn tại.' }]);
      if (tickets.some((t) => t.incidentId === i.id)) throw invalid('Báo hỏng này đã có phiếu bảo trì.');
      const t = { id: nextId('mt'), incidentId: i.id, equipmentId: i.equipmentId, status: 'IN_PROGRESS', startedAt: dayjs().format(), completedAt: null, note: String((b && b.note) || '').trim() || null };
      tickets.push(t);
      i.status = 'IN_PROGRESS';
      findEq(i.equipmentId).status = 'MAINTENANCE';
      return { ticket: t };
    }),
    route('PATCH', '/maintenance-tickets/([^/]+)', (m, q, b) => {
      const t = tickets.find((x) => x.id === m[1]);
      if (!t) throw notFound('phiếu bảo trì');
      if (t.status === 'DONE') throw invalid('Phiếu bảo trì đã hoàn tất.');
      if (b && b.note !== undefined) t.note = String(b.note).trim() || null;
      if (b && b.status === 'DONE') {
        Object.assign(t, { status: 'DONE', completedAt: dayjs().format() });
        incidents.find((x) => x.id === t.incidentId).status = 'RESOLVED';
        findEq(t.equipmentId).status = 'GOOD';
      }
      return { ticket: t };
    }),

    // ---- Quy tắc duyệt (FR-16)
    route('GET', '/approval-rules', () => ({ items: approvalRules.slice().sort((a, b) => a.priority - b.priority) })),
    route('POST', '/approval-rules', (m, q, b) => {
      const rule = { id: nextId('rule'), active: true };
      saveRule(rule, b || {});
      approvalRules.push(rule);
      return { rule };
    }),
    route('PATCH', '/approval-rules/([^/]+)', (m, q, b) => {
      const rule = approvalRules.find((x) => x.id === m[1]);
      if (!rule) throw notFound('quy tắc');
      return { rule: saveRule(rule, { ...rule, targetOrgId: rule.targetOrg.id, targetOrgName: rule.targetOrg.name, ...(b || {}) }) };
    }),

    // ---- Báo cáo thống kê (FR-22)
    route('GET', '/reports/summary', (m, q) => {
      const from = q.get('from') ? dayjs(q.get('from')) : null;
      const to = q.get('to') ? dayjs(q.get('to')) : null;
      const inRange = requests.filter((r) => (!from || !dayjs(r.startAt).isBefore(from)) && (!to || dayjs(r.startAt).isBefore(to)));
      const byStatus = { DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
      inRange.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
      const usage = new Map();
      for (const r of inRange.filter((x) => x.status === 'APPROVED')) {
        const u = usage.get(r.room.code) || { roomCode: r.room.code, roomName: r.room.name, bookings: 0, hours: 0 };
        u.bookings += 1;
        u.hours += dayjs(r.endAt).diff(r.startAt, 'minute') / 60;
        usage.set(r.room.code, u);
      }
      return {
        requests: { total: inRange.length, byStatus },
        brokenEquipment: equipment.filter((e) => e.status !== 'GOOD').length,
        openIncidents: incidents.filter((i) => i.status !== 'RESOLVED').length,
        roomUsage: [...usage.values()].sort((a, b) => b.hours - a.hours),
      };
    }),
  ];
}

function saveRule(rule, b) {
  const details = [];
  const code = String(b.code || '').trim();
  if (!/^[A-Z0-9_]{2,50}$/.test(code)) details.push({ field: 'code', message: 'Mã quy tắc gồm chữ in hoa, số và dấu gạch dưới, 2 đến 50 ký tự.' });
  else if (approvalRules.some((x) => x.id !== rule.id && x.code === code)) details.push({ field: 'code', message: 'Mã quy tắc đã tồn tại.' });
  if (!String(b.name || '').trim()) details.push({ field: 'name', message: 'Nhập tên quy tắc.' });
  if (!Number.isInteger(b.priority) || b.priority < 1) details.push({ field: 'priority', message: 'Thứ tự ưu tiên là số nguyên dương.' });
  if (!b.targetOrgId && !b.targetOrgName) details.push({ field: 'targetOrgId', message: 'Chọn đơn vị xử lý.' });
  const c = b.condition || {};
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if ((c.timeFrom && !hhmm.test(c.timeFrom)) || (c.timeTo && !hhmm.test(c.timeTo))) details.push({ field: 'condition', message: 'Giờ theo dạng HH:mm.' });
  else if (c.timeFrom && c.timeTo && c.timeFrom >= c.timeTo) details.push({ field: 'condition', message: 'Giờ bắt đầu phải trước giờ kết thúc.' });
  if (c.minParticipants !== undefined && c.minParticipants !== null && (!Number.isInteger(c.minParticipants) || c.minParticipants < 1)) details.push({ field: 'condition', message: 'Số người tối thiểu là số nguyên dương.' });
  if (!c.timeFrom && !c.timeTo && !c.minParticipants) details.push({ field: 'condition', message: 'Nhập ít nhất một điều kiện: khung giờ hoặc số người tối thiểu.' });
  if (details.length) throw bad(details);
  const condition = {};
  if (c.timeFrom) condition.timeFrom = c.timeFrom;
  if (c.timeTo) condition.timeTo = c.timeTo;
  if (c.minParticipants) condition.minParticipants = c.minParticipants;
  Object.assign(rule, { code, name: String(b.name).trim(), priority: b.priority, condition, targetOrg: { id: b.targetOrgId || null, name: b.targetOrgName || '' }, active: b.active !== false });
  return rule;
}
