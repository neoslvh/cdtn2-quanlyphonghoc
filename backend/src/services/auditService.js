const { isUuid, validation } = require('../http');

// Tầng service: tra cứu nhật ký thao tác của quản trị viên (FR-21).
const toEntry = (a) => ({
  id: a.id,
  action: a.action,
  entityType: a.entityType,
  entityId: a.entityId,
  userId: a.userId,
  userName: a.user ? a.user.fullName : null,
  before: a.beforeData ?? null,
  after: a.afterData ?? null,
  createdAt: a.createdAt.toISOString(),
});

function createAuditService(repo) {
  return {
    /** Tra cứu theo đối tượng, người thực hiện, hành động. Lỗi: VALIDATION_ERROR khi tham số không hợp lệ. */
    async list({ entityType, entityId, userId, action }, paging) {
      const details = [];
      const str = (v) => (typeof v === 'string' && v.length <= 80 ? v : undefined);
      if (entityType !== undefined && !str(entityType)) details.push({ field: 'entityType', message: 'Loại đối tượng không hợp lệ.' });
      if (action !== undefined && !str(action)) details.push({ field: 'action', message: 'Hành động không hợp lệ.' });
      if (entityId !== undefined && !isUuid(entityId)) details.push({ field: 'entityId', message: 'Mã đối tượng phải là UUID.' });
      if (userId !== undefined && !isUuid(userId)) details.push({ field: 'userId', message: 'Mã người dùng phải là UUID.' });
      if (details.length) throw validation(details);
      const { items, total } = await repo.listAudit({ entityType, entityId, userId, action, ...paging });
      return { items: items.map(toEntry), total };
    },
  };
}

module.exports = { createAuditService };
