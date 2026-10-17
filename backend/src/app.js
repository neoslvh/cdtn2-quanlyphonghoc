const express = require('express');

// db được truyền vào để kiểm thử được lớp HTTP mà không cần cơ sở dữ liệu thật.
function createApp({ db }) {
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

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  });

  return app;
}

module.exports = { createApp };
