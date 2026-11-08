// Chỉ coi là "không có" khi id sai định dạng (P2023) hoặc không tồn tại (P2025). Lỗi cơ sở dữ liệu khác phải nổi lên thành 500.
const missing = (err) => {
  if (['P2023', 'P2025'].includes(err.code)) return null;
  throw err;
};

// Ghi nhật ký thao tác (FR-21) và thông báo (FR-14). client là prisma hoặc tx trong một giao dịch, để nhật ký và
// thao tác chính cùng thành công hoặc cùng không xảy ra.
const audit = (client, { userId = null, action, entityType, entityId, before, after }) =>
  client.auditLog.create({ data: { userId, action, entityType, entityId, beforeData: before ?? undefined, afterData: after ?? undefined } });

const notify = (client, { userId, requestId = null, title, message }) => client.notification.create({ data: { userId, requestId, title, message } });

module.exports = { missing, audit, notify };
