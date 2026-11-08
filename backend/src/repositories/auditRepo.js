// Tầng repository: nhật ký thao tác và thông báo. Không chứa quy tắc nghiệp vụ.
const { audit, notify } = require('./common');

function createAuditRepo(prisma) {
  return {
    logAudit: (entry) => audit(prisma, entry),

    /** Tra cứu nhật ký, mới nhất trước. Trả { items, total }. */
    listAudit: async ({ entityType, entityId, userId, action, page, pageSize }) => {
      const where = { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}), ...(userId ? { userId } : {}), ...(action ? { action } : {}) };
      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({ where, include: { user: { select: { fullName: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.auditLog.count({ where }),
      ]);
      return { items: rows, total };
    },

    createNotification: (entry) => notify(prisma, entry),

    /** Thông báo của một người, mới nhất trước. unread chỉ lấy thông báo chưa đọc. Trả { items, total, unread }. */
    listNotifications: async ({ userId, unread, page, pageSize }) => {
      const where = { userId, ...(unread ? { readAt: null } : {}) };
      const [items, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId, readAt: null } }),
      ]);
      return { items, total, unread: unreadCount };
    },

    /** Đánh dấu một thông báo của chính người dùng là đã đọc. Trả thông báo, hoặc null nếu không phải của họ hoặc không có. */
    markNotificationRead: async (userId, id) => {
      const n = await prisma.notification.findFirst({ where: { id, userId } });
      if (!n || n.readAt) return n;
      return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    },

    markAllNotificationsRead: async (userId) => (await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })).count,
  };
}

module.exports = { createAuditRepo };
