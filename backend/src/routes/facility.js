const { Router } = require('express');
const multer = require('multer');
const { pageParams } = require('../http');
const { MAX_FILE_BYTES } = require('../services/requestService');

// Tầng route: mã QR, check-in, báo hỏng (API Contract mục 1.5). Ảnh báo hỏng đọc vào bộ nhớ rồi service kiểm tra và lưu.
function facilityRoutes({ service, guards }) {
  const router = Router();
  const { requireAuth, requireRole } = guards;
  const staff = requireRole('FACILITY_STAFF', 'ADMIN');
  const requester = requireRole('REQUESTER');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  // Địa chỉ trang giao diện để ghi vào mã QR, đặt bằng APP_URL. Không đặt thì lấy chính địa chỉ người dùng đang mở
  // (giao diện và API chung một tên miền), có xét X-Forwarded-Proto khi chạy sau proxy HTTPS như Render.
  const base = (req) => (process.env.APP_URL || `${(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim()}://${req.get('host')}`).replace(/\/+$/, '');
  const svg = (res, body) => res.type('image/svg+xml').set('Cache-Control', 'no-store').send(body);

  router.get('/rooms/:id/qr', requireAuth, staff, async (req, res) => svg(res, await service.roomQr(req.params.id, base(req))));
  router.get('/equipment/:id/qr', requireAuth, staff, async (req, res) => svg(res, await service.equipmentQr(req.params.id, base(req))));
  router.get('/qr/:token', requireAuth, async (req, res) => res.json(await service.resolveQr(req.params.token)));

  router.post('/requests/:id/checkin', requireAuth, requester, async (req, res) => res.json({ request: await service.checkin(req.user, req.params.id, req.body) }));

  router.post('/incidents', requireAuth, requester, upload.single('image'), async (req, res) => res.status(201).json({ incident: await service.reportIncident(req.user, req.body, req.file) }));
  router.get('/incidents', requireAuth, staff, async (req, res) => {
    const paging = pageParams(req.query);
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const { items, total } = await service.listIncidents({ status }, paging);
    res.json({ items, ...paging, total });
  });

  return router;
}

module.exports = { facilityRoutes };
