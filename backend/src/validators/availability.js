const { validation, pageParams } = require('../http');
const { LATEST_END_MINUTES, minutesOfDay, sameDay } = require('../timeVN');
const { ROOM_TYPES } = require('./room');

const EQUIPMENT_TYPES = ['MICROPHONE', 'PROJECTOR', 'AUDIO', 'AIR_CONDITIONER'];

const asDate = (v) => {
  const d = new Date(v);
  return typeof v === 'string' && v && !Number.isNaN(d.getTime()) ? d : null;
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
  if (!from) details.push({ field: 'from', message: 'Chọn thời gian bắt đầu.' });
  if (!to) details.push({ field: 'to', message: 'Chọn thời gian kết thúc.' });
  if (!Number.isInteger(capacity) || capacity < 1) details.push({ field: 'capacity', message: 'Nhập số người tham dự là số nguyên dương.' });
  if (from && to) {
    if (to <= from || !sameDay(from, to)) details.push({ field: 'to', message: 'Giờ kết thúc phải sau giờ bắt đầu và trong cùng ngày.' });
    else if (minutesOfDay(to) > LATEST_END_MINUTES) details.push({ field: 'to', message: 'Giờ kết thúc không muộn hơn 21:30.' });
  }
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
