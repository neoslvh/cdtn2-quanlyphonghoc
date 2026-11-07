// Chỉ coi là "không có" khi id sai định dạng (P2023) hoặc không tồn tại (P2025). Lỗi cơ sở dữ liệu khác phải nổi lên thành 500.
const missing = (err) => {
  if (['P2023', 'P2025'].includes(err.code)) return null;
  throw err;
};

module.exports = { missing };
