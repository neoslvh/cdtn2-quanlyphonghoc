// Test tích hợp trên PostgreSQL thật cho phát hiện trùng lịch. Chỉ chạy khi RUN_PG_TESTS=1.
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { fromVN } = require('../../src/timeVN');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;
const at = (h, mi = 0) => fromVN(2027, 3, 2, h, mi);

maybe('trùng lịch trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const service = createAvailabilityService(createDb(prisma));
  const tag = `V${Date.now().toString(36).toUpperCase()}`;
  let room;
  let admin;
  let batch;
  let org;

  beforeAll(async () => {
    room = await prisma.room.findUnique({ where: { code: 'D.02.01' } });
    admin = await prisma.user.findUnique({ where: { email: 'admin@qlphong.local' } });
    org = await prisma.organization.findFirst({ where: { name: 'Khoa Công nghệ thông tin' } });
    batch = await prisma.importBatch.create({ data: { importedBy: admin.id, semester: tag, mode: 'APPEND', fileName: 'test.csv', status: 'COMMITTED', rowCount: 1, sessionCount: 1, conflictCount: 0 } });
  });

  afterAll(async () => {
    await prisma.roomBooking.deleteMany({ where: { request: { purpose: tag } } });
    await prisma.usageRequest.deleteMany({ where: { purpose: tag } });
    await prisma.classSchedule.deleteMany({ where: { batchId: batch.id } });
    await prisma.importBatch.delete({ where: { id: batch.id } });
    await prisma.$disconnect();
  });

  const makeRequest = (startAt, endAt) =>
    prisma.usageRequest.create({ data: { requesterId: admin.id, organizationId: org.id, roomId: room.id, purpose: tag, startAt, endAt, participantCount: 10, status: 'APPROVED' } });

  test('buổi học ACTIVE chiếm phòng: tra cứu loại phòng, kiểm tra trả nguồn xung đột; khoảng chạm đầu mút thì không trùng', async () => {
    await prisma.classSchedule.create({ data: { batchId: batch.id, roomId: room.id, courseCode: 'PG101', courseName: 'Thử', classCode: 'K-PG', startAt: at(8), endAt: at(10), status: 'ACTIVE' } });
    const q = { from: at(9).toISOString(), to: at(11).toISOString(), capacity: '10' };
    expect((await service.findAvailable(q)).items.map((r) => r.code)).not.toContain('D.02.01');
    expect(await service.conflictDetails(room.id, at(9), at(11))).toEqual([{ source: 'CLASS_SCHEDULE', courseCode: 'PG101', classCode: 'K-PG' }]);
    expect(await service.conflictDetails(room.id, at(10), at(12))).toEqual([]);
    expect((await service.findAvailable({ ...q, from: at(10).toISOString(), to: at(12).toISOString() })).items.map((r) => r.code)).toContain('D.02.01');
  });

  test('buổi học PENDING (bản xem trước) không chặn phòng', async () => {
    await prisma.classSchedule.create({ data: { batchId: batch.id, roomId: room.id, courseCode: 'PG102', courseName: 'Thử', classCode: 'K-PG2', startAt: at(14), endAt: at(16), status: 'PENDING' } });
    expect(await service.conflictDetails(room.id, at(14), at(16))).toEqual([]);
  });

  test('lượt đặt ACTIVE báo mã yêu cầu, và ràng buộc loại trừ của cơ sở dữ liệu chặn lượt đặt thứ hai chồng giờ', async () => {
    const r1 = await makeRequest(at(17), at(19));
    await prisma.roomBooking.create({ data: { requestId: r1.id, roomId: room.id, startAt: at(17), endAt: at(19), status: 'ACTIVE' } });
    const [c] = await service.conflictDetails(room.id, at(18), at(20));
    expect(c).toMatchObject({ source: 'ROOM_BOOKING', requestCode: `REQ-${String(r1.requestNo).padStart(3, '0')}` });
    const r2 = await makeRequest(at(18), at(20));
    await expect(prisma.roomBooking.create({ data: { requestId: r2.id, roomId: room.id, startAt: at(18), endAt: at(20), status: 'ACTIVE' } })).rejects.toThrow(/room_booking_no_overlap|exclusion/i);
    const r3 = await makeRequest(at(19), at(21));
    await expect(prisma.roomBooking.create({ data: { requestId: r3.id, roomId: room.id, startAt: at(19), endAt: at(21), status: 'ACTIVE' } })).resolves.toBeTruthy();
  });
});
