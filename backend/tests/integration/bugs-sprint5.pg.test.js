// Test tích hợp trên PostgreSQL thật cho SCRUM-31 (hết hạn BR-07), SCRUM-32 (lý do từ chối), SCRUM-33 (lớp trùng giữa hai lần nhập).
// Chỉ chạy khi RUN_PG_TESTS=1.
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createApprovalService } = require('../../src/services/approvalService');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { createRequestService } = require('../../src/services/requestService');
const { createScheduleService } = require('../../src/services/scheduleService');
const { COLUMNS } = require('../../src/validators/schedule');
const { fromVN } = require('../../src/timeVN');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;

maybe('ba lỗi Sprint 5 trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const db = createDb(prisma);
  const availability = createAvailabilityService(db);
  const requests = createRequestService({ repo: db, availability, storage: { save: async () => 'x.pdf' } });
  const approvals = createApprovalService({ repo: db, availability });
  const schedule = createScheduleService({ repo: db, availability });
  const tag = `S5-${Date.now().toString(36).toUpperCase()}`;
  let requester;
  let pdt;
  let room;

  beforeAll(async () => {
    requester = await prisma.user.findUnique({ where: { email: 'sv01@qlphong.local' }, include: { organization: true } });
    pdt = await prisma.user.findUnique({ where: { email: 'daotao@qlphong.local' } });
    room = await prisma.room.findUnique({ where: { code: 'B.06.02' } });
    await prisma.room.update({ where: { id: room.id }, data: { status: 'AVAILABLE' } });
  });
  afterAll(async () => {
    const ids = (await prisma.usageRequest.findMany({ where: { purpose: { startsWith: tag } }, select: { id: true } })).map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { requestId: { in: ids } } });
    await prisma.usageRequest.deleteMany({ where: { id: { in: ids } } });
    await prisma.classSchedule.deleteMany({ where: { batch: { semester: { startsWith: tag } } } });
    await prisma.importBatch.deleteMany({ where: { semester: { startsWith: tag } } });
    await prisma.room.update({ where: { id: room.id }, data: { status: 'MAINTENANCE' } });
    await prisma.$disconnect();
  });

  const submitted = async (purpose, d) => {
    const r = await requests.create(requester, { organizationId: requester.organization.id, roomId: room.id, purpose: `${tag} ${purpose}`, startAt: fromVN(2032, 3, d, 8).toISOString(), endAt: fromVN(2032, 3, d, 9).toISOString(), participantCount: 20 });
    await requests.submit(requester, r.id);
    return r.id;
  };
  // Dời giờ của phiếu về quá khứ, như khi thời gian trôi qua mà phiếu chưa được duyệt xong.
  const makeOverdue = (id) => prisma.$executeRaw`UPDATE usage_request SET start_at = now() - interval '1 hour', end_at = now() WHERE id = ${id}::uuid`;

  test('SCRUM-31 phiếu quá giờ: duyệt bị chặn; tác vụ chuyển EXPIRED, hủy bước, gửi thông báo, ghi nhật ký đúng một lần', async () => {
    const id = await submitted('quá giờ', 1);
    const keep = await submitted('còn hạn', 2);
    await makeOverdue(id);
    await expect(approvals.approve(pdt, id, {})).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const [first, second] = await Promise.all([requests.expireOverdue(), requests.expireOverdue()]);
    expect(first + second).toBeGreaterThanOrEqual(1);
    const r = await prisma.usageRequest.findUnique({ where: { id }, include: { steps: true } });
    expect([r.status, r.steps.map((s) => s.status).sort()]).toEqual(['EXPIRED', ['CANCELLED', 'CANCELLED']]);
    expect(await prisma.notification.count({ where: { requestId: id, title: 'Yêu cầu sử dụng phòng đã hết hạn' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'REQUEST_EXPIRED' } })).toBe(1);
    expect((await prisma.usageRequest.findUnique({ where: { id: keep } })).status).toBe('PENDING');
  });

  test('SCRUM-32 chi tiết phiếu trả lý do từ chối và thời điểm quyết định', async () => {
    const id = await submitted('từ chối', 3);
    await approvals.reject(pdt, id, { reason: 'Trùng hội nghị khoa' });
    const detail = await requests.get(requester, id);
    expect(detail.steps[0]).toMatchObject({ status: 'REJECTED', decisionReason: 'Trùng hội nghị khoa' });
    expect(new Date(detail.steps[0].decidedAt).getTime()).toBeGreaterThan(Date.now() - 60000);
    expect(detail.steps[1]).toMatchObject({ status: 'CANCELLED', decisionReason: null, decidedAt: null });
  });

  test('SCRUM-33 lớp trùng phòng trùng giờ: bước kiểm tra báo lỗi theo dòng; xác nhận bản xem trước trùng bị chặn và hoàn tác', async () => {
    const csv = (sem, code, cls, start, count) => ({ originalname: 't.csv', size: 300, buffer: Buffer.from([COLUMNS.join(','), [sem, code, 'Môn thử', cls, '3', start, count, 'B.06.02', '02/03/2032', '02/03/2032'].join(',')].join('\n')) });
    const a = await schedule.createImport(pdt, csv(`${tag}-1`, 'S5A', 'K-S5A', '1', '3'), { semester: `${tag}-1`, mode: 'APPEND' });
    const b = await schedule.createImport(pdt, csv(`${tag}-2`, 'S5B', 'K-S5B', '2', '2'), { semester: `${tag}-2`, mode: 'APPEND' });
    await schedule.commit(pdt, a.batchId);
    const err = await schedule.createImport(pdt, csv(`${tag}-3`, 'S5C', 'K-S5C', '2', '2'), { semester: `${tag}-3`, mode: 'APPEND' }).then(() => null, (e) => e);
    expect([err.code, err.details]).toEqual(['IMPORT_INVALID', [{ row: 2, column: 'Mã phòng', message: 'Trùng giờ với lớp S5A (K-S5A) đang có hiệu lực trên phòng B.06.02 lúc 07:00 02/03/2032.' }]]);
    await expect(schedule.commit(pdt, b.batchId)).rejects.toMatchObject({ code: 'ROOM_CONFLICT', details: [{ source: 'CLASS_SCHEDULE', courseCode: 'S5A', classCode: 'K-S5A' }] });
    expect((await prisma.importBatch.findUnique({ where: { id: b.batchId } })).status).toBe('PREVIEW');
    expect(await prisma.classSchedule.count({ where: { batchId: b.batchId, status: 'PENDING' } })).toBe(1);
  });
});
