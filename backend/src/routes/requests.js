const { Router } = require('express');
const multer = require('multer');
const { pageParams } = require('../http');
const { MAX_FILE_BYTES } = require('../services/requestService');

// Tầng route: phiếu đề xuất sử dụng phòng (API Contract mục 1.4). Tệp đính kèm đọc vào bộ nhớ rồi service kiểm tra và lưu.
function requestRoutes({ service, guards }) {
  const router = Router();
  const { requireAuth, requireRole } = guards;
  const requester = requireRole('REQUESTER');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

  router.post('/requests', requireAuth, requester, async (req, res) => res.status(201).json({ request: await service.create(req.user, req.body || {}) }));

  router.get('/requests', requireAuth, requireRole('REQUESTER', 'ADMIN'), async (req, res) => {
    const paging = pageParams(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, total } = await service.list(req.user, { status }, paging);
    res.json({ items, ...paging, total });
  });

  router.get('/requests/:id', requireAuth, requireRole('REQUESTER', 'ADMIN', 'FACILITY_STAFF'), async (req, res) => res.json({ request: await service.get(req.user, req.params.id) }));

  router.patch('/requests/:id', requireAuth, requester, async (req, res) => res.json({ request: await service.update(req.user, req.params.id, req.body || {}) }));

  router.post('/requests/:id/attachments', requireAuth, requester, upload.single('file'), async (req, res) =>
    res.status(201).json({ request: await service.attach(req.user, req.params.id, req.file) }),
  );

  router.post('/requests/:id/submit', requireAuth, requester, async (req, res) => res.json({ request: await service.submit(req.user, req.params.id) }));

  router.post('/requests/:id/cancel', requireAuth, requester, async (req, res) => res.json({ request: await service.cancel(req.user, req.params.id, (req.body || {}).reason) }));

  return router;
}

module.exports = { requestRoutes };
