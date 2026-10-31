const express = require('express');
const { authRoutes, ApiError } = require('./auth');

// db được truyền vào để kiểm thử được lớp HTTP mà không cần cơ sở dữ liệu thật.
function createApp({ db, jwtSecret = 'khoa-bi-mat-chi-dung-khi-kiem-thu', bcryptRounds, limiter, allowRegistration }) {
  const app = express();
  app.use(express.json());

  app.get('/api/hello', async (req, res, next) => {
    try {
      const roomCount = await db.countRooms();
      res.json({ message: 'Xin chào từ API quản lý phòng học', roomCount });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', authRoutes({ db, jwtSecret, bcryptRounds, limiter, allowRegistration }));

  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
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
