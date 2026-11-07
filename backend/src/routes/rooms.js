const { Router } = require('express');
const { pageParams } = require('../http');

// Tầng route: nhận request HTTP, gọi service, đổi kết quả thành JSON. Lỗi nghiệp vụ đi thẳng tới bộ xử lý lỗi chung.
function roomRoutes({ service, guards }) {
  const router = Router();
  const { requireAuth, requireRole } = guards;
  const manage = requireRole('FACILITY_STAFF', 'ADMIN');

  // Danh sách phòng. Không truyền page thì trả toàn bộ để dùng cho ô chọn phòng.
  router.get('/rooms', requireAuth, async (req, res) => {
    const { campus, roomType, status, q } = req.query;
    const filters = { campus, roomType, status, q: typeof q === 'string' ? q.trim() : '' };
    if (!req.query.page) {
      const { items, total } = await service.list(filters, null);
      return res.json({ items, page: 1, pageSize: items.length, total });
    }
    const paging = pageParams(req.query);
    const { items, total } = await service.list(filters, paging);
    res.json({ items, ...paging, total });
  });

  router.get('/rooms/:id', requireAuth, async (req, res) => res.json({ room: await service.get(req.params.id) }));

  router.post('/rooms', requireAuth, manage, async (req, res) => res.status(201).json({ room: await service.create(req.body || {}) }));

  router.patch('/rooms/:id', requireAuth, manage, async (req, res) => res.json({ room: await service.update(req.params.id, req.body || {}) }));

  return router;
}

module.exports = { roomRoutes };
