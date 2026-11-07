const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Tòa nhà theo cơ sở. Mã tòa là chữ cái đầu của mã phòng.
const buildings = [
  { code: 'A', name: 'Tòa A', campus: 'Cơ sở 1' },
  { code: 'B', name: 'Tòa B', campus: 'Cơ sở 1' },
  { code: 'C', name: 'Tòa C', campus: 'Cơ sở 2' },
  { code: 'D', name: 'Tòa D', campus: 'Cơ sở 3' },
];

// Phòng mẫu kèm số lượng thiết bị tốt mỗi loại.
const rooms = [
  { code: 'A.10.01', name: 'Phòng A.10.01', roomType: 'CLASSROOM', capacity: 80, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 2, MICROPHONE: 2 } },
  { code: 'A.10.02', name: 'Phòng A.10.02', roomType: 'CLASSROOM', capacity: 100, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 4, MICROPHONE: 2, AUDIO: 1 } },
  { code: 'B.05.04', name: 'Phòng B.05.04', roomType: 'CLASSROOM', capacity: 45, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 2 } },
  { code: 'B.06.01', name: 'Phòng máy B.06.01', roomType: 'LAB', capacity: 60, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 3 } },
  { code: 'B.06.02', name: 'Phòng máy B.06.02', roomType: 'LAB', capacity: 40, status: 'MAINTENANCE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 2 } },
  { code: 'C.03.01', name: 'Hội trường C.03.01', roomType: 'HALL', capacity: 250, status: 'AVAILABLE', equipment: { PROJECTOR: 2, AIR_CONDITIONER: 6, MICROPHONE: 6, AUDIO: 2 } },
  { code: 'C.03.02', name: 'Phòng C.03.02', roomType: 'CLASSROOM', capacity: 60, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 2, MICROPHONE: 1 } },
  { code: 'D.02.01', name: 'Phòng D.02.01', roomType: 'CLASSROOM', capacity: 90, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 3, MICROPHONE: 2 } },
  { code: 'D.03.01', name: 'Hội trường D.03.01', roomType: 'HALL', capacity: 300, status: 'AVAILABLE', equipment: { PROJECTOR: 2, AIR_CONDITIONER: 8, MICROPHONE: 8, AUDIO: 2 } },
];

const EQUIPMENT_NAME = { PROJECTOR: 'Máy chiếu', AIR_CONDITIONER: 'Máy lạnh', MICROPHONE: 'Micro', AUDIO: 'Âm thanh' };

// Bảng khung tiết: tiết 1 đến 6 buổi sáng từ 07:00, tiết 7 đến 12 buổi chiều từ 13:00, mỗi tiết 45 phút.
const periodSlots = Array.from({ length: 12 }, (_, i) => {
  const base = i < 6 ? 7 * 60 : 13 * 60;
  const start = base + (i % 6) * 45;
  const time = (m) => new Date(Date.UTC(1970, 0, 1, Math.floor(m / 60), m % 60));
  return { periodNo: i + 1, startTime: time(start), endTime: time(start + 45) };
});

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
  { fullName: 'Người đăng ký mẫu', email: 'sv01@qlphong.local', role: 'REQUESTER', org: 'Khoa Công nghệ thông tin' },
];

async function seedRooms() {
  const buildingIds = {};
  for (const b of buildings) {
    buildingIds[b.code] = (await prisma.building.upsert({ where: { code: b.code }, update: {}, create: b })).id;
  }
  for (const r of rooms) {
    const { equipment, ...data } = r;
    // Phòng đã có thì giữ nguyên, để thay đổi của quản trị viên không bị ghi đè khi khởi động lại.
    const room = await prisma.room.upsert({ where: { code: r.code }, update: {}, create: { ...data, buildingId: buildingIds[r.code[0]] } });
    for (const [type, count] of Object.entries(equipment)) {
      for (let i = 1; i <= count; i++) {
        const assetCode = `${r.code}-${type}-${i}`;
        await prisma.equipment.upsert({
          where: { assetCode },
          update: {},
          create: { assetCode, roomId: room.id, name: `${EQUIPMENT_NAME[type]} ${i}`, equipmentType: type, status: 'GOOD' },
        });
      }
    }
  }
  for (const p of periodSlots) {
    await prisma.periodSlot.upsert({ where: { periodNo: p.periodNo }, update: {}, create: p });
  }
}

async function main() {
  await seedRooms();
  const orgIds = {};
  for (const o of organizations) {
    const found = await prisma.organization.findFirst({ where: { name: o.name } });
    orgIds[o.name] = (found || (await prisma.organization.create({ data: o }))).id;
  }
  // Môi trường production không có mật khẩu mặc định: thiếu SEED_PASSWORD thì không tạo tài khoản mẫu.
  const seedPassword = process.env.SEED_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'Demo@12345');
  let seeded = 0;
  if (seedPassword) {
    const passwordHash = await bcrypt.hash(seedPassword, 10);
    for (const a of accounts) {
      // Tài khoản đã có thì giữ nguyên, để vai trò và trạng thái admin đã chỉnh không bị ghi đè khi khởi động lại.
      const create = { organizationId: orgIds[a.org], fullName: a.fullName, role: a.role, status: 'ACTIVE', email: a.email, passwordHash };
      await prisma.user.upsert({ where: { email: a.email }, update: {}, create });
      seeded++;
    }
  } else {
    console.warn('NODE_ENV=production và chưa đặt SEED_PASSWORD: bỏ qua tài khoản mẫu.');
  }
  console.log(`Đã nạp ${rooms.length} phòng, ${periodSlots.length} khung tiết, ${organizations.length} đơn vị và ${seeded} tài khoản mẫu`);
}

main().finally(() => prisma.$disconnect());
