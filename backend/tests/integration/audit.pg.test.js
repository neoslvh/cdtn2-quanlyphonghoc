// Test tích hợp trên PostgreSQL thật cho nhật ký thao tác và thông báo. Chỉ chạy khi RUN_PG_TESTS=1.
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createAuditService } = require('../../src/services/auditService');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { createNotificationService } = require('../../src/services/notificationService');
const { createRequestService } = require('../../src/services/requestService');
const { createScheduleService } = require('../../src/services/scheduleService');
const { COLUMNS } = require('../../src/validators/schedule');
const { fromVN } = require('../../src/timeVN');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;

maybe('nhật ký và thông báo trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const db = createDb(prisma);
  const availability = createAvailabilityService(db);
  const schedule = createScheduleService({ repo: db, availability });
  const requests = createRequestService({ repo: db, availability, storage: { save: async () => 'x.pdf', remove: async () => {} } });
  const notifications = createNotificationService(db);
  const audits = createAuditService(db);
  const semester = `AU-${Date.now().toString(36).toUpperCase()}`;
  let pdt;
  let requester;
  let room;

  beforeAll(async () => {
    pdt = await prisma.user.findUnique({ where: { email: 'daotao@qlphong.local' }, include: { organization: true } });
    requester = await prisma.user.findUnique({ where: { email: 'sv01@qlphong.local' }, include: { organization: true } });
    room = await prisma.room.findUnique({ where: { code: 'D.03.01' } });
  });
  afterAll(async () => {
    const reqs = await prisma.usageRequest.findMany({ where: { purpose: semester }, select: { id: true } });
    const batches = await prisma.importBatch.findMany({ where: { semester }, select: { id: true } });
    const ids = [...reqs, ...batches].map((x) => x.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { requestId: { in: reqs.map((r) => r.id) } } });
    await prisma.usageRequest.deleteMany({ where: { purpose: semester } });
    await prisma.classSchedule.deleteMany({ where: { batch: { semester } } });
    await prisma.importBatch.deleteMany({ where: { semester } });
    await prisma.$disconnect();
  });

  const csv = (cls) => ({ originalname: 't.csv', size: 300, buffer: Buffer.from([COLUMNS.join(','), [semester, 'AU100', 'Thử nhật ký', cls, '2', '1', '3', 'D.03.01', '08/02/2027', '15/02/2027'].join(',')].join('\n')) });

  test('xác nhận nhập hủy yêu cầu trùng: thông báo, nhật ký của lần nhập và của yêu cầu cùng được ghi trong một giao dịch', async () => {
    const draft = await requests.create(requester, { organizationId: requester.organization.id, roomId: room.id, purpose: semester, startAt: fromVN(2027, 2, 8, 8).toISOString(), endAt: fromVN(2027, 2, 8, 10).toISOString(), participantCount: 30 });
    const sent = await requests.submit(requester, draft.id);
    expect(sent.status).toBe('PENDING');
    const preview = await schedule.createImport(pdt, csv('K-AU'), { semester, mode: 'APPEND' });
    expect(preview.conflicts).toHaveLength(1);
    const done = await schedule.commit(pdt, preview.batchId);
    expect(done.cancelledRequests[0].id).toBe(draft.id);

    const inbox = await notifications.list(requester, {}, { page: 1, pageSize: 50 });
    const mine = inbox.items.find((n) => n.requestId === draft.id);
    expect(mine).toMatchObject({ title: 'Yêu cầu sử dụng phòng bị hủy', read: false });
    expect(mine.message).toBe('Phòng D.03.01 có lớp AU100 (K-AU) theo thời khóa biểu mới của Phòng Đào tạo.');

    const batchLog = await audits.list({ entityType: 'import_batch', entityId: preview.batchId }, { page: 1, pageSize: 10 });
    expect(batchLog.items.map((a) => a.action).sort()).toEqual(['SCHEDULE_IMPORT_COMMITTED', 'SCHEDULE_IMPORT_PREVIEWED']);
    const committed = batchLog.items.find((a) => a.action === 'SCHEDULE_IMPORT_COMMITTED');
    expect(committed).toMatchObject({ userId: pdt.id, userName: pdt.fullName, after: { activatedSessions: 2, cancelledRequests: 1 } });
    const reqLog = await audits.list({ entityId: draft.id }, { page: 1, pageSize: 20 });
    expect(reqLog.items.map((a) => a.action)).toEqual(expect.arrayContaining(['REQUEST_CREATED', 'REQUEST_SUBMITTED', 'REQUEST_CANCELLED_BY_SCHEDULE']));
  });

  test('đánh dấu đã đọc chỉ ảnh hưởng thông báo của chính mình', async () => {
    const inbox = await notifications.list(requester, { unread: 'true' }, { page: 1, pageSize: 50 });
    const n = inbox.items.find((x) => x.title === 'Yêu cầu sử dụng phòng bị hủy');
    const stranger = { ...pdt };
    await expect(notifications.markRead(stranger, n.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await notifications.markRead(requester, n.id)).read).toBe(true);
    expect((await notifications.list(requester, { unread: 'true' }, { page: 1, pageSize: 50 })).items.find((x) => x.id === n.id)).toBeUndefined();
  });

  test('sửa và hủy buổi học ghi nhật ký có giá trị trước và sau', async () => {
    const preview = await schedule.createImport(pdt, csv('K-AU2'), { semester, mode: 'REPLACE' });
    await schedule.commit(pdt, preview.batchId);
    const s = await prisma.classSchedule.findFirst({ where: { batchId: preview.batchId }, orderBy: { startAt: 'asc' } });
    await schedule.updateSession(pdt, s.id, { startAt: fromVN(2027, 2, 8, 15).toISOString(), endAt: fromVN(2027, 2, 8, 16).toISOString() });
    await schedule.cancelSession(pdt, s.id);
    const log = await audits.list({ entityId: s.id }, { page: 1, pageSize: 10 });
    expect(log.items.map((a) => a.action)).toEqual(['CLASS_SESSION_CANCELLED', 'CLASS_SESSION_UPDATED']);
    const updated = log.items.find((a) => a.action === 'CLASS_SESSION_UPDATED');
    expect(updated.before.roomCode).toBe('D.03.01');
    expect(updated.after.startAt).toBe(fromVN(2027, 2, 8, 15).toISOString());
  });

  test('hủy bản xem trước ghi nhật ký; nhật ký tra cứu được theo người thực hiện', async () => {
    const preview = await schedule.createImport(pdt, csv('K-AU3'), { semester, mode: 'APPEND' });
    await schedule.discard(pdt, preview.batchId);
    const log = await audits.list({ entityType: 'import_batch', entityId: preview.batchId, userId: pdt.id }, { page: 1, pageSize: 10 });
    expect(log.items.map((a) => a.action).sort()).toEqual(['SCHEDULE_IMPORT_DISCARDED', 'SCHEDULE_IMPORT_PREVIEWED']);
  });
});
