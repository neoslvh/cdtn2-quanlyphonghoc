// Test tích hợp trên PostgreSQL thật. Chỉ chạy khi RUN_PG_TESTS=1 và DATABASE_URL trỏ tới cơ sở dữ liệu đã migrate và seed.
//   RUN_PG_TESTS=1 DATABASE_URL=postgresql://... npm test -- integration
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createRoomService } = require('../../src/services/roomService');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;

maybe('phòng trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const service = createRoomService(createDb(prisma));
  const tag = `T${Date.now().toString(36).toUpperCase()}`;
  const body = (n, over = {}) => ({ code: `${tag}.01.${n}`, name: `Phòng thử ${n}`, campus: 'Cơ sở 3', roomType: 'CLASSROOM', capacity: 30, status: 'AVAILABLE', ...over });

  afterAll(async () => {
    await prisma.room.deleteMany({ where: { code: { startsWith: tag } } });
    await prisma.building.deleteMany({ where: { code: tag } });
    await prisma.$disconnect();
  });

  test('danh sách có thiết bị tốt theo loại và phân trang trong cơ sở dữ liệu', async () => {
    const all = await service.list({}, null);
    expect(all.total).toBeGreaterThanOrEqual(9);
    const a1001 = all.items.find((r) => r.code === 'A.10.01');
    expect(a1001.equipment).toMatchObject({ PROJECTOR: 1, AIR_CONDITIONER: 2, MICROPHONE: 2 });
    const page = await service.list({}, { page: 2, pageSize: 4 });
    expect(page.items).toHaveLength(4);
    expect(page.total).toBe(all.total);
  });

  test('tám yêu cầu cùng thêm một mã phòng: đúng một thành công, còn lại báo mã trùng, không có lỗi 500', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.create(body('R1'))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
    expect(rejected.every((e) => e.status === 400 && e.details[0].field === 'code')).toBe(true);
  });

  test('CHECK của cơ sở dữ liệu từ chối trạng thái sai dù lớp trên bị bỏ qua', async () => {
    const room = await service.create(body('R2'));
    await expect(prisma.room.update({ where: { id: room.id }, data: { status: 'AVAILBLE' } })).rejects.toThrow();
  });

  test('sửa phòng không đổi mã, đổi được trạng thái và lọc thấy ngay', async () => {
    const room = await service.create(body('R3'));
    await service.update(room.id, body('R3', { status: 'MAINTENANCE' }));
    const found = await service.list({ status: 'MAINTENANCE', q: tag }, null);
    expect(found.items.map((r) => r.code)).toContain(room.code);
  });
});
