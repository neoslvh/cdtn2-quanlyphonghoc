// Test tích hợp trên PostgreSQL thật cho nhập thời khóa biểu. Chỉ chạy khi RUN_PG_TESTS=1.
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { createRequestService } = require('../../src/services/requestService');
const { createScheduleService } = require('../../src/services/scheduleService');
const { COLUMNS } = require('../../src/validators/schedule');
const { fromVN } = require('../../src/timeVN');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;

maybe('thời khóa biểu trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const db = createDb(prisma);
  const availability = createAvailabilityService(db);
  const schedule = createScheduleService({ repo: db, availability });
  const requests = createRequestService({ repo: db, availability, storage: { save: async () => 'x.pdf' } });
  const semester = `HK-${Date.now().toString(36).toUpperCase()}`;
  let admin;
  let requester;
  let room;
  const csv = (rows) => ({ originalname: 'tkb.csv', size: 500, buffer: Buffer.from([COLUMNS.join(','), ...rows].join('\n'), 'utf8') });
  // Thứ hai 04/01/2027 đến 18/01/2027 (3 buổi) tiết 1 đến 3 tức 07:00 đến 09:15 giờ Việt Nam.
  const line = (cls = 'K-PG') => [semester, 'PG200', 'Thử tích hợp', cls, '2', '1', '3', 'B.05.04', '04/01/2027', '18/01/2027'].join(',');

  beforeAll(async () => {
    admin = await prisma.user.findUnique({ where: { email: 'admin@qlphong.local' }, include: { organization: true } });
    requester = await prisma.user.findUnique({ where: { email: 'sv01@qlphong.local' }, include: { organization: true } });
    room = await prisma.room.findUnique({ where: { code: 'B.05.04' } });
  });
  afterAll(async () => {
    await prisma.roomBooking.deleteMany({ where: { request: { purpose: semester } } });
    await prisma.usageRequest.deleteMany({ where: { purpose: semester } });
    await prisma.classSchedule.deleteMany({ where: { batch: { semester } } });
    await prisma.importBatch.deleteMany({ where: { semester } });
    await prisma.$disconnect();
  });

  // Phiếu PENDING hoặc APPROVED của phòng B.05.04 vào thứ hai 11/01/2027 08:00 đến 10:00.
  const makeRequest = (status) =>
    prisma.usageRequest.create({
      data: { requesterId: requester.id, organizationId: requester.organization.id, roomId: room.id, purpose: semester, startAt: fromVN(2027, 1, 11, 8), endAt: fromVN(2027, 1, 11, 10), participantCount: 10, status,
        steps: { create: [{ stepNo: 1, approverOrgId: requester.organization.id, status: 'PENDING' }] } },
    });

  test('bản xem trước chưa chiếm phòng; xác nhận thì phòng bị chiếm đúng 3 buổi, tra cứu phòng trống loại phòng đó', async () => {
    const p = await schedule.createImport(admin, csv([line()]), { semester, mode: 'APPEND' });
    expect(p).toMatchObject({ status: 'PREVIEW', rowCount: 1, sessionCount: 3 });
    expect(await availability.conflictDetails(room.id, fromVN(2027, 1, 4, 7), fromVN(2027, 1, 4, 9))).toEqual([]);
    const done = await schedule.commit(p.batchId);
    expect(done).toMatchObject({ activatedSessions: 3, replacedSessions: 0 });
    expect(await availability.conflictDetails(room.id, fromVN(2027, 1, 4, 8), fromVN(2027, 1, 4, 9))).toEqual([{ source: 'CLASS_SCHEDULE', courseCode: 'PG200', classCode: 'K-PG' }]);
    const q = { from: fromVN(2027, 1, 4, 8).toISOString(), to: fromVN(2027, 1, 4, 9).toISOString(), capacity: '10' };
    expect((await availability.findAvailable(q)).items.map((r) => r.code)).not.toContain('B.05.04');
  });

  test('gửi phiếu vào giờ có lớp bị chặn ROOM_CONFLICT bằng dữ liệu thật', async () => {
    const draft = await requests.create(requester, { organizationId: requester.organization.id, roomId: room.id, purpose: semester, startAt: fromVN(2027, 1, 25, 8).toISOString(), endAt: fromVN(2027, 1, 25, 10).toISOString(), participantCount: 10 });
    const clash = await requests.create(requester, { organizationId: requester.organization.id, roomId: room.id, purpose: semester, startAt: fromVN(2027, 1, 18, 8).toISOString(), endAt: fromVN(2027, 1, 18, 10).toISOString(), participantCount: 10 });
    const err = await requests.submit(requester, clash.id).then(() => null, (e) => e);
    expect([err.status, err.code, err.details]).toEqual([409, 'ROOM_CONFLICT', [{ source: 'CLASS_SCHEDULE', courseCode: 'PG200', classCode: 'K-PG' }]]);
    await expect(requests.submit(requester, draft.id)).resolves.toMatchObject({ status: 'PENDING' });
  });

  test('xem trước tìm đúng yêu cầu PENDING và APPROVED trùng bằng tstzrange; xác nhận hủy phiếu, bước duyệt và lượt đặt', async () => {
    const pending = await makeRequest('PENDING');
    const approved = await makeRequest('APPROVED');
    await prisma.roomBooking.create({ data: { requestId: approved.id, roomId: room.id, startAt: approved.startAt, endAt: approved.endAt, status: 'ACTIVE' } });
    const p = await schedule.createImport(admin, csv([line('K-REPLACE')]), { semester, mode: 'REPLACE' });
    expect(p.conflicts.map((c) => c.requestStatus).sort()).toEqual(['APPROVED', 'PENDING']);
    expect(p.conflicts[0]).toMatchObject({ roomCode: 'B.05.04', conflictWith: { courseCode: 'PG200', classCode: 'K-REPLACE' } });
    const done = await schedule.commit(p.batchId);
    expect(done.replacedSessions).toBe(3);
    expect(done.cancelledRequests).toHaveLength(2);
    expect(done.cancelledRequests[0].cancelReason).toBe('Phòng B.05.04 có lớp PG200 (K-REPLACE) theo thời khóa biểu mới của Phòng Đào tạo.');
    expect((await prisma.usageRequest.findUnique({ where: { id: pending.id } })).status).toBe('CANCELLED');
    expect((await prisma.approvalStep.findMany({ where: { requestId: approved.id } })).every((s) => s.status === 'CANCELLED')).toBe(true);
    expect((await prisma.roomBooking.findUnique({ where: { requestId: approved.id } })).status).toBe('CANCELLED');
    const active = await prisma.classSchedule.findMany({ where: { batch: { semester }, status: 'ACTIVE' } });
    expect(active.map((s) => s.classCode)).toEqual(['K-REPLACE', 'K-REPLACE', 'K-REPLACE']);
  });

  test('năm yêu cầu cùng xác nhận một lần nhập: đúng một thành công, buổi học chỉ được kích hoạt một lần', async () => {
    const p = await schedule.createImport(admin, csv([line('K-RACE')]), { semester, mode: 'APPEND' });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => schedule.commit(p.batchId)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'INVALID_STATE')).toBe(true);
    expect(await prisma.classSchedule.count({ where: { batchId: p.batchId, status: 'ACTIVE' } })).toBe(3);
  });

  test('hủy xem trước xóa các buổi PENDING; sửa buổi sang giờ trùng buổi khác bị chặn ROOM_CONFLICT', async () => {
    const p = await schedule.createImport(admin, csv([line('K-DISCARD')]), { semester, mode: 'APPEND' });
    await schedule.discard(p.batchId);
    expect(await prisma.classSchedule.count({ where: { batchId: p.batchId } })).toBe(0);
    const sessions = await prisma.classSchedule.findMany({ where: { batch: { semester }, status: 'ACTIVE' }, orderBy: { startAt: 'asc' } });
    const [a, b] = sessions;
    const err = await schedule.updateSession(b.id, { startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString() }).then(() => null, (e) => e);
    expect([err.status, err.code]).toEqual([409, 'ROOM_CONFLICT']);
    // Chuyển sang 15:00 đến 16:00, giờ không có lớp nào nên sửa được.
    const free = { startAt: fromVN(2027, 1, 4, 15).toISOString(), endAt: fromVN(2027, 1, 4, 16).toISOString() };
    await expect(schedule.updateSession(a.id, free)).resolves.toMatchObject({ id: a.id, ...free });
  });

  test('khung tiết đọc đúng từ cơ sở dữ liệu', async () => {
    const { items } = await schedule.periodSlots();
    expect(items).toHaveLength(12);
    expect(items[0]).toEqual({ period: 1, startTime: '07:00', endTime: '07:45' });
  });
});
