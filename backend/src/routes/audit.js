const { Router } = require('express');
const { pageParams } = require('../http');

// Tầng route: tra cứu nhật ký thao tác, chỉ ADMIN (API Contract mục 1.4).
function auditRoutes({ service, guards }) {
  const router = Router();
  router.get('/audit-logs', guards.requireAuth, guards.requireRole('ADMIN'), async (req, res) => {
    const paging = pageParams(req.query);
    const { entityType, entityId, userId, action } = req.query;
    const { items, total } = await service.list({ entityType, entityId, userId, action }, paging);
    res.json({ items, ...paging, total });
  });
  return router;
}

module.exports = { auditRoutes };
