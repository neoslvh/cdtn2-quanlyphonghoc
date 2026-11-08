// Test tích hợp trên PostgreSQL thật cho duyệt phiếu và kiểm tra lại trước cấp cuối. Chỉ chạy khi RUN_PG_TESTS=1.
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createApprovalService } = require('../../src/services/approvalService');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { createRequestService } = require('../../src/services/requestService');
const { fromVN } = require('../../src/timeVN');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;

maybe('duyệt phiếu trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const db = createDb(prisma);
  const availability = createAvailabilityService(db);
  const requests = createRequestService({ repo: db, availability, storage: { save: async () => 'x.pdf', remove: async () => {} } });
  const approvals = createApprovalService({ repo: db, availability });
  const tag = `AP-${Date.now().toString(36).toUpperCase()}`;
  let requester;
  let pdt;
  let csvc;
  let room;

  // Ngày xa trong tương lai để không đụng dữ liệu của các test khác; mỗi test một khung giờ riêng.
  const body = (h, over = {}) => ({ organizationId: requester.organization.id, roomId: room.id, purpose: tag, startAt: fromVN(2028, 3, 6, h).toISOString(), endAt: fromVN(2028, 3, 6, h + 1).toISOString(), participantCount: 30, ...over });
  const sent = async (h, over) => (await requests.submit(requester, (await requests.create(requester, body(h, over))).id)).id;
  const both = async (id) => {
    await approvals.approve(pdt, id, {});
    return approvals.approve(csvc, id, {});
  };

  beforeAll(async () => {
    requester = await prisma.user.findUnique({ where: { email: 'sv01@qlphong.local' }, include: { organization: true } });
    pdt = await prisma.user.findUnique({ where: { email: 'daotao@qlphong.local' } });
    csvc = await prisma.user.findUnique({ where: { email: 'csvc@qlphong.local' } });
    room = await prisma.room.findUnique({ where: { code: 'D.03.01' } });
  });
  afterAll(async () => {
    const ids = (await prisma.usageRequest.findMany({ where: { purpose: tag }, select: { id: true } })).map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { requestId: { in: ids } } });
    await prisma.roomBooking.deleteMany({ where: { requestId: { in: ids } } });
    await prisma.classSchedule.deleteMany({ where: { batch: { semester: tag } } });
    await prisma.importBatch.deleteMany({ where: { semester: tag } });
    await prisma.usageRequest.deleteMany({ where: { purpose: tag } });
    await prisma.$disconnect();
  });

  test('duyệt đủ hai bước: tạo room_booking ACTIVE, thông báo và nhật ký cùng được ghi', async () => {
    const id = await sent(7);
    const mid = await approvals.approve(pdt, id, { reason: 'Đồng ý' });
    expect(mid.steps.map((s) => s.status)).toEqual(['APPROVED', 'PENDING']);
    expect(await prisma.roomBooking.count({ where: { requestId: id } })).toBe(0);
    const done = await approvals.approve(csvc, id, {});
    expect(done.status).toBe('APPROVED');
    expect(await prisma.roomBooking.findUnique({ where: { requestId: id } })).toMatchObject({ roomId: room.id, status: 'ACTIVE' });
    expect((await prisma.notification.findMany({ where: { requestId: id } })).map((n) => n.title)).toEqual(['Yêu cầu sử dụng phòng đã được duyệt']);
    const log = await prisma.auditLog.findMany({ where: { entityId: id, action: { in: ['REQUEST_STEP_APPROVED', 'REQUEST_APPROVED'] } } });
    expect(log.map((a) => a.action).sort()).toEqual(['REQUEST_APPROVED', 'REQUEST_STEP_APPROVED']);
    const steps = await prisma.approvalStep.findMany({ where: { requestId: id }, orderBy: { stepNo: 'asc' } });
    expect(steps.map((s) => [s.status, s.approverUserId])).toEqual([['APPROVED', pdt.id], ['APPROVED', csvc.id]]);
  });

  test('lịch học chính khóa nhập sau khi gửi: bước cuối không cho duyệt và không để lại lượt đặt', async () => {
    const id = await sent(9);
    await approvals.approve(pdt, id, {});
    const batch = await prisma.importBatch.create({ data: { importedBy: pdt.id, semester: tag, mode: 'APPEND', fileName: 't.csv', status: 'COMMITTED', rowCount: 1, sessionCount: 1, conflictCount: 0 } });
    await prisma.classSchedule.create({ data: { batchId: batch.id, roomId: room.id, courseCode: 'AP100', courseName: 'Thử', classCode: 'K-AP', startAt: fromVN(2028, 3, 6, 9), endAt: fromVN(2028, 3, 6, 10), status: 'ACTIVE' } });
    await expect(approvals.approve(csvc, id, {})).rejects.toMatchObject({ code: 'ROOM_CONFLICT', details: [{ source: 'CLASS_SCHEDULE', classCode: 'K-AP' }] });
    expect(await prisma.roomBooking.count({ where: { requestId: id } })).toBe(0);
    expect((await prisma.usageRequest.findUnique({ where: { id } })).status).toBe('PENDING');
  });

  test('hai phiếu cùng phòng cùng giờ duyệt bước cuối đồng thời: đúng một phiếu được duyệt', async () => {
    const a = await sent(11);
    const b = await sent(11, { purpose: tag });
    await Promise.all([approvals.approve(pdt, a, {}), approvals.approve(pdt, b, {})]);
    const results = await Promise.allSettled([approvals.approve(csvc, a, {}), approvals.approve(csvc, b, {})]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason).toMatchObject({ code: 'ROOM_CONFLICT' });
    expect(await prisma.roomBooking.count({ where: { requestId: { in: [a, b] }, status: 'ACTIVE' } })).toBe(1);
  });

  test('cùng một phiếu bị duyệt bước đầu đồng thời: đúng một thành công, bước kế chỉ được mở một lần', async () => {
    const id = await sent(13);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => approvals.approve(pdt, id, {})));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((x) => x.status === 'rejected')) expect(r.reason).toMatchObject({ code: expect.stringMatching(/INVALID_STATE|FORBIDDEN/) });
    const steps = await prisma.approvalStep.findMany({ where: { requestId: id }, orderBy: { stepNo: 'asc' } });
    expect(steps.map((s) => s.status)).toEqual(['APPROVED', 'PENDING']);
  });

  test('từ chối: phiếu REJECTED, bước sau bị hủy, thông báo kèm lý do; sau đó không duyệt được nữa', async () => {
    const id = await sent(15);
    const res = await approvals.reject(pdt, id, { reason: 'Trùng sự kiện' });
    expect([res.status, res.steps.map((s) => s.status)]).toEqual(['REJECTED', ['REJECTED', 'CANCELLED']]);
    expect((await prisma.notification.findFirst({ where: { requestId: id } })).message).toContain('Trùng sự kiện');
    await expect(approvals.approve(pdt, id, {})).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(both(id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});
