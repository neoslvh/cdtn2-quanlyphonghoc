const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const rooms = [
  { code: 'A.101', building: 'Tòa A', capacity: 60 },
  { code: 'B.204', building: 'Tòa B', capacity: 40 },
];

// Đơn vị mẫu theo ERD: REQUESTER_UNIT cho người đăng ký, APPROVAL_UNIT cho bên duyệt, FACILITY_UNIT cho bên quản lý phòng.
const organizations = [
  { name: 'Khoa Công nghệ thông tin', type: 'REQUESTER_UNIT' },
  { name: 'Khoa Kinh tế - Tài chính', type: 'REQUESTER_UNIT' },
  { name: 'Khoa Ngoại ngữ', type: 'REQUESTER_UNIT' },
  { name: 'Phòng Công tác sinh viên', type: 'REQUESTER_UNIT' },
  { name: 'Phòng Đào tạo', type: 'APPROVAL_UNIT' },
  { name: 'Ban Giám hiệu', type: 'APPROVAL_UNIT' },
  { name: 'Phòng Quản trị cơ sở vật chất', type: 'FACILITY_UNIT' },
];

// Tài khoản dùng cho phát triển và demo. Mật khẩu lấy từ biến môi trường SEED_PASSWORD, mặc định chỉ để chạy thử.
const accounts = [
  { fullName: 'Quản trị hệ thống', email: 'admin@qlphong.local', role: 'ADMIN', org: 'Phòng Quản trị cơ sở vật chất' },
  { fullName: 'Nhân viên cơ sở vật chất', email: 'csvc@qlphong.local', role: 'FACILITY_STAFF', org: 'Phòng Quản trị cơ sở vật chất' },
  { fullName: 'Cán bộ Phòng Đào tạo', email: 'daotao@qlphong.local', role: 'APPROVER', org: 'Phòng Đào tạo' },
];

async function main() {
  for (const room of rooms) {
    await prisma.room.upsert({ where: { code: room.code }, update: room, create: room });
  }
  const orgIds = {};
  for (const o of organizations) {
    const found = await prisma.organization.findFirst({ where: { name: o.name } });
    orgIds[o.name] = (found || (await prisma.organization.create({ data: o }))).id;
  }
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD || 'Demo@12345', 10);
  for (const a of accounts) {
    const data = { organizationId: orgIds[a.org], fullName: a.fullName, role: a.role, status: 'ACTIVE' };
    await prisma.user.upsert({ where: { email: a.email }, update: data, create: { ...data, email: a.email, passwordHash } });
  }
  console.log(`Đã nạp ${rooms.length} phòng, ${organizations.length} đơn vị và ${accounts.length} tài khoản mẫu`);
}

main().finally(() => prisma.$disconnect());
