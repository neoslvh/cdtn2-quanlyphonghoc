const { PrismaClient } = require('@prisma/client');
const { createApp } = require('./app');

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  console.error('Thiếu JWT_SECRET (tối thiểu 16 ký tự). Xem backend/.env.example.');
  process.exit(1);
}

const prisma = new PrismaClient();
const withOrg = { include: { organization: true } };
// Chỉ coi là "không có" khi id sai định dạng (P2023) hoặc không tồn tại (P2025). Lỗi cơ sở dữ liệu khác phải nổi lên thành 500.
const missing = (err) => {
  if (['P2023', 'P2025'].includes(err.code)) return null;
  throw err;
};
const db = {
  countRooms: () => prisma.room.count(),
  listOrganizations: ({ all }) =>
    prisma.organization.findMany({
      where: { active: true, ...(all ? {} : { type: 'REQUESTER_UNIT' }) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true },
    }),
  findOrganization: (id) => prisma.organization.findUnique({ where: { id } }).catch(missing),
  findUserByEmail: (email) => prisma.user.findUnique({ where: { email }, ...withOrg }),
  findUserById: (id) => prisma.user.findUnique({ where: { id }, ...withOrg }).catch(missing),
  createUser: (data) => prisma.user.create({ data }),
  listUsers: ({ status }) => prisma.user.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, ...withOrg }),
  updateUser: (id, data) => prisma.user.update({ where: { id }, data, ...withOrg }).catch(missing),
};

const port = Number(process.env.PORT) || 3000;
// Mặc định đóng đăng ký tự do, tài khoản do quản trị viên cấp theo SRS (FR-01, US-17). Đặt ALLOW_SELF_REGISTRATION=true để mở.
createApp({ db, jwtSecret, allowRegistration: process.env.ALLOW_SELF_REGISTRATION === 'true' }).listen(port, () => {
  console.log(`API đang chạy tại http://localhost:${port}`);
});
