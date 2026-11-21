const path = require('path');
const express = require('express');
const { authRoutes } = require('./auth');
const { ApiError } = require('./errors');
const { createGuards } = require('./guards');
const { approvalRoutes } = require('./routes/approvals');
const { auditRoutes } = require('./routes/audit');
const { availabilityRoutes } = require('./routes/availability');
const { notificationRoutes } = require('./routes/notifications');
const { requestRoutes } = require('./routes/requests');
const { roomRoutes } = require('./routes/rooms');
const { scheduleRoutes } = require('./routes/schedule');
const { createDiskStorage } = require('./storage');
const { createApprovalService } = require('./services/approvalService');
const { createAuditService } = require('./services/auditService');
const { createAvailabilityService } = require('./services/availabilityService');
const { createNotificationService } = require('./services/notificationService');
const { createRequestService } = require('./services/requestService');
const { createScheduleService } = require('./services/scheduleService');
const { createRoomService } = require('./services/roomService');

// db được truyền vào để kiểm thử được lớp HTTP mà không cần cơ sở dữ liệu thật.
// storage lưu tệp đính kèm, clock cho phép kiểm thử cố định thời gian hiện tại.
function createApp({ db, jwtSecret = 'khoa-bi-mat-chi-dung-khi-kiem-thu', bcryptRounds, limiter, allowRegistration, storage = createDiskStorage(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')), clock }) {
  const app = express();
  app.use(express.json());
  const guards = createGuards({ db, jwtSecret });

  app.get('/api/hello', async (req, res, next) => {
    try {
      const roomCount = await db.countRooms();
      res.json({ message: 'Xin chào từ API quản lý phòng học', roomCount });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', authRoutes({ db, jwtSecret, bcryptRounds, limiter, allowRegistration }));
  // /rooms/available phải đứng trước /rooms/:id.
  const availability = createAvailabilityService(db);
  app.use('/api', availabilityRoutes({ service: availability, guards }));
  app.use('/api', requestRoutes({ service: createRequestService({ repo: db, availability, storage, clock }), guards }));
  app.use('/api', approvalRoutes({ service: createApprovalService({ repo: db, availability, clock }), guards }));
  app.use('/api', scheduleRoutes({ service: createScheduleService({ repo: db, availability }), guards }));
  app.use('/api', notificationRoutes({ service: createNotificationService(db), guards }));
  app.use('/api', auditRoutes({ service: createAuditService(db), guards }));
  app.use('/api', roomRoutes({ service: createRoomService(db), guards }));

  // API không tồn tại luôn trả JSON, không được rơi vào fallback React khi deploy chung một service.
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy API.' } }));

  // Khi triển khai một dịch vụ duy nhất, server cũng phục vụ bản React đã build.
  // Chỉ bật khi CLIENT_DIST_DIR được thiết lập để môi trường API cục bộ và test HTTP giữ nguyên hành vi.
  const clientDistDir = process.env.CLIENT_DIST_DIR;
  if (clientDistDir) {
    app.use(express.static(clientDistDir, { index: false }));
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
      if (path.extname(req.path)) return next();
      res.sendFile('index.html', { root: clientDistDir });
    });
  }

  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Tệp vượt quá giới hạn 5 MB.' } });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Chỉ gửi một tệp trong trường file.' } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Nội dung gửi lên không phải JSON hợp lệ.' } });
    }
    console.error(err);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  });

  return app;
}

module.exports = { createApp };
