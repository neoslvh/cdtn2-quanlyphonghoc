const { PrismaClient } = require('@prisma/client');
const { createApp } = require('./app');
const { createDb } = require('./repositories');
const { createDiskStorage } = require('./storage');

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  console.error('Thiếu JWT_SECRET (tối thiểu 16 ký tự). Xem backend/.env.example.');
  process.exit(1);
}

const db = createDb(new PrismaClient());

const port = Number(process.env.PORT) || 3000;
// Mặc định đóng đăng ký tự do, tài khoản do quản trị viên cấp theo SRS (FR-01, US-17). Đặt ALLOW_SELF_REGISTRATION=true để mở.
createApp({ db, jwtSecret, allowRegistration: process.env.ALLOW_SELF_REGISTRATION === 'true', storage: createDiskStorage(process.env.UPLOAD_DIR || './uploads') }).listen(port, () => {
  console.log(`API đang chạy tại http://localhost:${port}`);
});
