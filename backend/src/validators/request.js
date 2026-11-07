const { isUuid, validation } = require('../http');
const { EQUIPMENT_TYPES } = require('./availability');

const ITEM_TYPES = [...EQUIPMENT_TYPES, 'OTHER'];
// Chỉ nhận ISO 8601 có múi giờ, chuỗi không múi giờ bị hiểu theo giờ máy chủ (UTC) nên sai 7 tiếng.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const asDate = (v) => {
  if (typeof v !== 'string' || !ISO_WITH_ZONE.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Kiểm tra nội dung tạo hoặc sửa phiếu đề xuất (API Contract bảng 1.6). Chỉ kiểm tra định dạng, các quy tắc nghiệp vụ
 * (đủ 3 ngày làm việc, 21:30, sức chứa, trùng lịch...) kiểm tra khi gửi để người dùng lưu dở được.
 * Trả: { organizationId, roomId, purpose, startAt, endAt, participantCount, equipment: [{ itemType, quantity, otherDescription }] }.
 * Lỗi: VALIDATION_ERROR kèm trường sai, tên trường thiết bị dạng equipment.0.otherDescription.
 */
function checkRequestBody(b) {
  const details = [];
  const add = (field, message) => details.push({ field, message });
  if (!isUuid(b.organizationId)) add('organizationId', 'Chọn đơn vị đăng ký.');
  if (!isUuid(b.roomId)) add('roomId', 'Chọn phòng.');
  const purpose = typeof b.purpose === 'string' ? b.purpose.trim() : '';
  if (!purpose) add('purpose', 'Nhập mục đích sử dụng.');
  else if (purpose.length > 500) add('purpose', 'Mục đích tối đa 500 ký tự.');
  const startAt = asDate(b.startAt);
  const endAt = asDate(b.endAt);
  if (!startAt || !endAt) add('startAt', 'Chọn khoảng thời gian, dạng ISO 8601 có múi giờ (ví dụ 2026-11-10T08:00:00+07:00).');
  else if (endAt <= startAt) add('startAt', 'Giờ kết thúc phải sau giờ bắt đầu.');
  if (!Number.isInteger(b.participantCount) || b.participantCount < 1 || b.participantCount > 2000) add('participantCount', 'Số người tham dự là số nguyên từ 1 đến 2000.');

  const equipment = [];
  if (b.equipment !== undefined && !Array.isArray(b.equipment)) add('equipment', 'Danh sách thiết bị không hợp lệ.');
  const seen = new Set();
  (Array.isArray(b.equipment) ? b.equipment : []).forEach((e, i) => {
    const item = e && typeof e === 'object' ? e : {};
    const quantity = item.quantity === undefined ? 1 : item.quantity;
    if (!ITEM_TYPES.includes(item.itemType)) return add(`equipment.${i}.itemType`, 'Chọn loại thiết bị.');
    if (seen.has(item.itemType)) return add(`equipment.${i}.itemType`, 'Mỗi loại thiết bị chỉ khai một dòng, gộp số lượng vào dòng đó.');
    seen.add(item.itemType);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) add(`equipment.${i}.quantity`, 'Số lượng từ 1 đến 50.');
    const other = typeof item.otherDescription === 'string' ? item.otherDescription.trim() : '';
    if (item.itemType === 'OTHER' && !other) add(`equipment.${i}.otherDescription`, 'Mô tả thiết bị khác.');
    if (other.length > 200) add(`equipment.${i}.otherDescription`, 'Mô tả tối đa 200 ký tự.');
    equipment.push({ itemType: item.itemType, quantity, otherDescription: item.itemType === 'OTHER' ? other : null });
  });
  if (details.length) throw validation(details);
  return { organizationId: b.organizationId, roomId: b.roomId, purpose, startAt, endAt, participantCount: b.participantCount, equipment };
}

module.exports = { ITEM_TYPES, checkRequestBody };
