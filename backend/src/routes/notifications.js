const { Router } = require('express');
const { pageParams } = require('../http');

// Tầng route: thông báo của tôi (API Contract mục 1.4), mọi vai trò đã đăng nhập đều dùng được.
function notificationRoutes({ service, guards }) {
  const router = Router();
  const { requireAuth } = guards;

  router.get('/notifications', requireAuth, async (req, res) => {
    const paging = pageParams(req.query);
    const unread = typeof req.query.unread === 'string' ? req.query.unread : undefined;
    res.json({ ...(await service.list(req.user, { unread }, paging)), ...paging });
  });
  // read-all phải đứng trước /:id/read để không bị hiểu nhầm là id.
  router.post('/notifications/read-all', requireAuth, async (req, res) => res.json(await service.markAllRead(req.user)));
  router.patch('/notifications/:id/read', requireAuth, async (req, res) => res.json({ notification: await service.markRead(req.user, req.params.id) }));

  return router;
}

module.exports = { notificationRoutes };
