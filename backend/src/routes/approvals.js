const { Router } = require('express');
const { pageParams } = require('../http');

// Tầng route: duyệt phiếu (API Contract mục 1.4). Chỉ APPROVER, và service kiểm tra thêm đơn vị của bước hiện tại.
function approvalRoutes({ service, guards }) {
  const router = Router();
  const { requireAuth, requireRole } = guards;
  const approver = requireRole('APPROVER');

  router.get('/approvals', requireAuth, approver, async (req, res) => {
    const paging = pageParams(req.query);
    res.json({ ...(await service.listPending(req.user, paging)), ...paging });
  });
  router.post('/requests/:id/approve', requireAuth, approver, async (req, res) => res.json({ request: await service.approve(req.user, req.params.id, req.body) }));
  router.post('/requests/:id/reject', requireAuth, approver, async (req, res) => res.json({ request: await service.reject(req.user, req.params.id, req.body) }));

  return router;
}

module.exports = { approvalRoutes };
