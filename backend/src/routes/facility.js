const { Router } = require('express');
const multer = require('multer');
const { ApiError } = require('../errors');
const { pageParams } = require('../http');
const { MAX_FILE_BYTES } = require('../services/requestService');

// Tầng route: mã QR, check-in, báo hỏng (API Contract mục 1.5). Ảnh báo hỏng đọc vào bộ nhớ rồi service kiểm tra và lưu.
function facilityRoutes({ service, guards }) {
  const router = Router();
  const { requireAuth, requireRole } = guards;
  const staff = requireRole('FACILITY_STAFF', 'ADMIN');
  const requester = requireRole('REQUESTER');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  // Địa chỉ giao diện ghi vào mã QR: APP_URL, hoặc RENDER_EXTERNAL_URL do Render tự cấp. Mã QR được in và dán cố định
  // nên trên môi trường thật không lấy từ header Host do client gửi (giả được để trỏ sang trang lạ); chỉ khi chạy thử
  // (không phải production) mới dùng địa chỉ người dùng đang mở cho tiện.
  const base = (req) => {
    const configured = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
    if (configured) return configured.replace(/\/+$/, '');
    if (process.env.NODE_ENV === 'production') throw new ApiError(500, 'CONFIG_ERROR', 'Máy chủ chưa cấu hình APP_URL nên chưa tạo được mã QR.');
    return `${(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim()}://${req.get('host')}`;
  };
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
