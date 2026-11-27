// Đường dẫn quay về sau khi đăng nhập: chỉ nhận đường dẫn nội bộ bắt đầu bằng một dấu /, không theo sau bởi / hoặc \
// (trình duyệt hiểu //host và /\host là trang ngoài). Giá trị khác về Trang chủ.
export const safeRedirect = (from) => (typeof from === 'string' && /^\/(?![/\\])/.test(from) ? from : '/');
