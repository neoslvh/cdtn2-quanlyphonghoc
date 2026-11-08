const { Router } = require('express');
const multer = require('multer');
const { pageParams } = require('../http');
const { COLUMNS } = require('../validators/schedule');
const { MAX_FILE_BYTES } = require('../services/scheduleService');

// Tầng route: khung tiết và lịch học chính khóa (API Contract mục 1.4 và 1.5.5).
// Mọi API lịch học chỉ dành cho ADMIN và APPROVER thuộc Phòng Đào tạo (BR-12), kiểm tra ở máy chủ.
function scheduleRoutes({ service, guards }) {
  const router = Router();
  const { requireAuth, requireScheduleManager } = guards;
  const manage = [requireAuth, requireScheduleManager];
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

  router.get('/period-slots', requireAuth, async (req, res) => res.json(await service.periodSlots()));

  // Tệp mẫu CSV có BOM để Excel mở đúng tiếng Việt.
  router.get('/class-schedule/template', ...manage, (req, res) => {
    const sample = ['HK1 2026-2027', 'IT001', 'Lập trình Web', 'K29-SE01', '2', '1', '3', 'A.10.01', '14/09/2026', '27/12/2026'];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="thoi-khoa-bieu-mau.csv"' });
    res.send(`﻿${COLUMNS.join(',')}\n${sample.join(',')}\n`);
  });

  router.post('/class-schedule/imports', ...manage, upload.single('file'), async (req, res) =>
    res.status(201).json(await service.createImport(req.user, req.file, req.body || {})),
  );

  router.get('/class-schedule/imports', ...manage, async (req, res) => {
    const paging = pageParams(req.query);
    const { items, total } = await service.listImports(paging);
    res.json({ items, ...paging, total });
  });

  router.get('/class-schedule/imports/:id', ...manage, async (req, res) => res.json(await service.getImport(req.params.id)));
  router.post('/class-schedule/imports/:id/commit', ...manage, async (req, res) => res.json(await service.commit(req.user, req.params.id)));
  router.delete('/class-schedule/imports/:id', ...manage, async (req, res) => {
    await service.discard(req.user, req.params.id);
    res.status(204).end();
  });

  router.get('/class-schedule', ...manage, async (req, res) => {
    const { roomCode, from, to, status } = req.query;
    const paging = pageParams(req.query);
    const str = (v) => (typeof v === 'string' ? v : undefined);
    const { items, total } = await service.listSessions({ roomCode: str(roomCode), from: str(from), to: str(to), status: str(status) }, paging);
    res.json({ items, ...paging, total });
  });

  router.patch('/class-schedule/:id', ...manage, async (req, res) => res.json({ session: await service.updateSession(req.user, req.params.id, req.body || {}) }));
  router.post('/class-schedule/:id/cancel', ...manage, async (req, res) => res.json({ session: await service.cancelSession(req.user, req.params.id) }));

  return router;
}

module.exports = { scheduleRoutes };
