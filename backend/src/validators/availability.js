const { validation, pageParams } = require('../http');
const { LATEST_END_MINUTES, minutesOfDay, sameDay } = require('../timeVN');
const { ROOM_TYPES } = require('./room');

const EQUIPMENT_TYPES = ['MICROPHONE', 'PROJECTOR', 'AUDIO', 'AIR_CONDITIONER'];

// Chỉ nhận ISO 8601 có múi giờ (Z hoặc +07:00). Chuỗi không múi giờ bị hiểu theo giờ máy chủ (UTC) nên sai 7 tiếng.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const asDate = (v) => {
  if (typeof v !== 'string' || !ISO_WITH_ZONE.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Kiểm tra tham số tra cứu phòng trống (API Contract mục 1.5.2).
 * Nhận: query của GET /rooms/available.
 * Trả: { from, to, capacity, campus, roomType, equipment: [{ type, qty }], page, pageSize }.
 * Lỗi: VALIDATION_ERROR kèm trường sai. to phải sau from, cùng ngày và không muộn hơn 21:30.
 */
function checkAvailableQuery(q) {
  const details = [];
  const from = asDate(q.from);
  const to = asDate(q.to);
  const capacity = Number(q.capacity);
  if (!from) details.push({ field: 'from', message: 'Chọn thời gian bắt đầu, dạng ISO 8601 có múi giờ (ví dụ 2026-11-10T08:00:00+07:00).' });
  if (!to) details.push({ field: 'to', message: 'Chọn thời gian kết thúc, dạng ISO 8601 có múi giờ (ví dụ 2026-11-10T10:00:00+07:00).' });
  if (!Number.isInteger(capacity) || capacity < 1) details.push({ field: 'capacity', message: 'Nhập số người tham dự là số nguyên dương.' });
  if (from && to) {
    if (to <= from || !sameDay(from, to)) details.push({ field: 'to', message: 'Giờ kết thúc phải sau giờ bắt đầu và trong cùng ngày.' });
    else if (minutesOfDay(to) > LATEST_END_MINUTES) details.push({ field: 'to', message: 'Giờ kết thúc không muộn hơn 21:30.' });
  }
  // Query có thể là mảng hoặc object (campus=a&campus=b, campus[x]=1), chỉ nhận chuỗi.
  if (q.campus !== undefined && (typeof q.campus !== 'string' || q.campus.length > 120)) details.push({ field: 'campus', message: 'Cơ sở không hợp lệ.' });
  if (q.roomType && !ROOM_TYPES.includes(q.roomType)) details.push({ field: 'roomType', message: 'Loại phòng không hợp lệ.' });
  const equipment = [];
  for (const part of String(q.equipment || '').split(',').filter(Boolean)) {
    const [type, qtyText = '1'] = part.split(':');
    const qty = Number(qtyText);
    if (!EQUIPMENT_TYPES.includes(type) || !Number.isInteger(qty) || qty < 1) {
      details.push({ field: 'equipment', message: `Thiết bị "${part}" không hợp lệ. Dạng đúng: MICROPHONE:2,PROJECTOR:1.` });
      break;
    }
    equipment.push({ type, qty });
  }
  if (details.length) throw validation(details);
  return { from, to, capacity, campus: q.campus || undefined, roomType: q.roomType || undefined, equipment, ...pageParams(q) };
}

module.exports = { EQUIPMENT_TYPES, checkAvailableQuery };
