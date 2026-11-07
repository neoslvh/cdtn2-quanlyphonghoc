const { Router } = require('express');

// Tầng route: tra cứu phòng trống, mọi vai trò đã đăng nhập đều dùng được (API Contract mục 1.3).
// Phải được gắn trước routes/rooms để /rooms/available không bị hiểu là /rooms/:id.
function availabilityRoutes({ service, guards }) {
  const router = Router();
  router.get('/rooms/available', guards.requireAuth, async (req, res) => res.json(await service.findAvailable(req.query)));
  return router;
}

module.exports = { availabilityRoutes };
