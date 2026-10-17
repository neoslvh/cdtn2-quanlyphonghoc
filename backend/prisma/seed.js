const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const rooms = [
  { code: 'A.101', building: 'Tòa A', capacity: 60 },
  { code: 'B.204', building: 'Tòa B', capacity: 40 },
];

async function main() {
  for (const room of rooms) {
    await prisma.room.upsert({ where: { code: room.code }, update: room, create: room });
  }
  console.log(`Đã nạp ${rooms.length} phòng mẫu`);
}

main().finally(() => prisma.$disconnect());
