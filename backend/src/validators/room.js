const { validation } = require('../http');

// Tầng validator: chỉ kiểm tra định dạng dữ liệu vào, không biết gì về cơ sở dữ liệu hay quy tắc nghiệp vụ.
const ROOM_TYPES = ['CLASSROOM', 'LAB', 'HALL'];
const ROOM_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'];

/**
 * Kiểm tra nội dung thêm hoặc sửa phòng (FR-03).
 * Nhận: body đã parse từ JSON.
 * Trả: { code, name, campus, roomType, capacity, status } đã làm sạch.
 * Lỗi: VALIDATION_ERROR kèm danh sách trường sai để giao diện hiện ngay dưới ô nhập.
 */
function checkRoom(b) {
  const details = [];
  const code = typeof b.code === 'string' ? b.code.trim() : '';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const campus = typeof b.campus === 'string' ? b.campus.trim() : '';
  if (!code) details.push({ field: 'code', message: 'Nhập mã phòng.' });
  else if (code.length > 20) details.push({ field: 'code', message: 'Mã phòng tối đa 20 ký tự.' });
  if (!name) details.push({ field: 'name', message: 'Nhập tên phòng.' });
  else if (name.length > 100) details.push({ field: 'name', message: 'Tên phòng tối đa 100 ký tự.' });
  if (!campus) details.push({ field: 'campus', message: 'Chọn cơ sở.' });
  else if (campus.length > 120) details.push({ field: 'campus', message: 'Tên cơ sở tối đa 120 ký tự.' });
  if (!ROOM_TYPES.includes(b.roomType)) details.push({ field: 'roomType', message: 'Chọn loại phòng.' });
  if (!Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > 2000) details.push({ field: 'capacity', message: 'Sức chứa là số nguyên từ 1 đến 2000.' });
  if (!ROOM_STATUSES.includes(b.status)) details.push({ field: 'status', message: 'Chọn trạng thái.' });
  if (details.length) throw validation(details);
  return { code, name, campus, roomType: b.roomType, capacity: b.capacity, status: b.status };
}

/** Kiểm tra các tham số lọc danh sách phòng. */
function checkRoomFilter({ campus, roomType, status, building, minCapacity }) {
  if (campus !== undefined && (typeof campus !== 'string' || campus.length > 120)) throw validation([{ field: 'campus', message: 'Cơ sở không hợp lệ.' }]);
  // Query có thể là mảng khi gửi trùng tham số, chỉ nhận chuỗi.
  if (building !== undefined && (typeof building !== 'string' || building.length > 30)) throw validation([{ field: 'building', message: 'Mã tòa không hợp lệ.' }]);
  if (minCapacity !== undefined && (!/^\d{1,4}$/.test(String(minCapacity)) || Number(minCapacity) < 1)) throw validation([{ field: 'minCapacity', message: 'Sức chứa tối thiểu là số nguyên dương.' }]);
  if (roomType && !ROOM_TYPES.includes(roomType)) throw validation([{ field: 'roomType', message: 'Loại phòng không hợp lệ.' }]);
  if (status && !ROOM_STATUSES.includes(status)) throw validation([{ field: 'status', message: 'Trạng thái không hợp lệ.' }]);
}

module.exports = { ROOM_TYPES, ROOM_STATUSES, checkRoom, checkRoomFilter };
