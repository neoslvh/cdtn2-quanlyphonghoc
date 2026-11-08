const { ApiError } = require('../errors');
const { isUuid } = require('../http');

// Tầng service: thông báo của chính người dùng (FR-14). Mỗi người chỉ thấy và đánh dấu thông báo của mình.
const toNotification = (n) => ({
  id: n.id,
  requestId: n.requestId,
  title: n.title,
  message: n.message,
  read: Boolean(n.readAt),
  createdAt: n.createdAt.toISOString(),
});

function createNotificationService(repo) {
  return {
    /** Danh sách thông báo của người dùng, mới nhất trước, kèm số thông báo chưa đọc. Nhận unread='true' để chỉ lấy chưa đọc. */
    async list(user, { unread }, paging) {
      const { items, total, unread: unreadCount } = await repo.listNotifications({ userId: user.id, unread: unread === 'true', ...paging });
      return { items: items.map(toNotification), total, unread: unreadCount };
    },

    /** Đánh dấu một thông báo đã đọc. Thông báo của người khác trả NOT_FOUND. */
    async markRead(user, id) {
      const n = isUuid(id) ? await repo.markNotificationRead(user.id, id) : null;
      if (!n) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy thông báo.');
      return toNotification(n);
    },

    async markAllRead(user) {
      return { updated: await repo.markAllNotificationsRead(user.id) };
    },
  };
}

module.exports = { createNotificationService, toNotification };
