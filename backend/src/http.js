const { ApiError } = require('./errors');

// Quy ước chung của API Contract mục 1.1: danh sách nhận page, pageSize (mặc định 20, tối đa 100) và trả items, page, pageSize, total.
function pageParams(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));
  return { page, pageSize };
}

function paginate(items, query) {
  const { page, pageSize } = pageParams(query);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length };
}

// Dữ liệu gửi lên không hợp lệ: details liệt kê từng trường lỗi để giao diện hiện ngay dưới ô nhập.
function validation(details, message = 'Dữ liệu không hợp lệ.') {
  return new ApiError(400, 'VALIDATION_ERROR', message, details);
}

// UUID hợp lệ hay không, để id sai định dạng trả 404 thay vì lỗi cơ sở dữ liệu.
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

module.exports = { pageParams, paginate, validation, isUuid };
