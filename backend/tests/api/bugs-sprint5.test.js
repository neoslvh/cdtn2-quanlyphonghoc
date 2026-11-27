const request = require('supertest');
const { createApp } = require('../../src/app');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { createRequestService } = require('../../src/services/requestService');
const { COLUMNS } = require('../../src/validators/schedule');
const { fromVN } = require('../../src/timeVN');
const { fakeDb, login, addRoom, fakeStorage } = require('../helpers');

// Ba lỗi tìm được khi kiểm thử luồng toàn diện: SCRUM-31 (BR-07 hết hạn), SCRUM-32 (lý do từ chối), SCRUM-33 (lớp trùng giữa hai lần nhập).
const CNTT = '00000000-0000-4000-9000-0000000000a1';
const PDT = '00000000-0000-4000-9000-0000000000a2';
const day = (d, h) => fromVN(2026, 11, d, h).toISOString();

function setup() {
  const db = fakeDb();
  const room = addRoom(db, { code: 'A.10.01', capacity: 80 });
  const clock = { now: fromVN(2026, 11, 2, 8) };
  const app = createApp({ db, storage: fakeStorage(), clock: () => clock.now });
  const service = createRequestService({ repo: db, availability: createAvailabilityService(db), storage: fakeStorage(), clock: () => clock.now });
  return { db, app, room, clock, service, requester: login(db, 'REQUESTER'), pdt: login(db, 'APPROVER', PDT), admin: login(db, 'ADMIN') };
}
async function submitted({ app, room, requester }, d = 9) {
  const body = { organizationId: CNTT, roomId: room.id, purpose: 'Thử', startAt: day(d, 8), endAt: day(d, 10), participantCount: 30 };
  const id = (await request(app).post('/api/requests').set(requester.auth).send(body)).body.request.id;
  await request(app).post(`/api/requests/${id}/submit`).set(requester.auth);
  return id;
}

describe('SCRUM-31: phiếu đến giờ bắt đầu mà chưa duyệt xong thì hết hạn (BR-07)', () => {
  test('đã qua giờ bắt đầu thì không duyệt, không từ chối được và không còn trong hàng chờ', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    expect((await request(ctx.app).get('/api/approvals').set(ctx.pdt.auth)).body.total).toBe(1);
    ctx.clock.now = fromVN(2026, 11, 9, 8);
    const ap = await request(ctx.app).post(`/api/requests/${id}/approve`).set(ctx.pdt.auth).send({});
    expect([ap.status, ap.body.error.code, ap.body.error.message]).toEqual([409, 'INVALID_STATE', 'Yêu cầu đã đến giờ bắt đầu mà chưa duyệt xong nên đã hết hạn.']);
    const rj = await request(ctx.app).post(`/api/requests/${id}/reject`).set(ctx.pdt.auth).send({ reason: 'Muộn' });
    expect([rj.status, rj.body.error.code]).toEqual([409, 'INVALID_STATE']);
    expect((await request(ctx.app).get('/api/approvals').set(ctx.pdt.auth)).body.total).toBe(0);
    expect(ctx.db.bookings).toHaveLength(0);
  });

  test('tác vụ hết hạn chuyển EXPIRED, hủy các bước còn chờ, báo người đăng ký và ghi nhật ký; phiếu chưa tới giờ giữ nguyên', async () => {
    const ctx = setup();
    const due = await submitted(ctx, 9);
    const later = await submitted(ctx, 10);
    expect(await ctx.service.expireOverdue()).toBe(0);
    ctx.clock.now = fromVN(2026, 11, 9, 9);
    expect(await ctx.service.expireOverdue()).toBe(1);
    const r = (await request(ctx.app).get(`/api/requests/${due}`).set(ctx.requester.auth)).body.request;
    expect([r.status, r.steps.map((s) => s.status)]).toEqual(['EXPIRED', ['CANCELLED', 'CANCELLED']]);
    expect((await request(ctx.app).get(`/api/requests/${later}`).set(ctx.requester.auth)).body.request.status).toBe('PENDING');
    const inbox = (await request(ctx.app).get('/api/notifications').set(ctx.requester.auth)).body.items;
    expect(inbox[0]).toMatchObject({ requestId: due, title: 'Yêu cầu sử dụng phòng đã hết hạn' });
    expect(inbox[0].message).toMatch(/^Yêu cầu REQ-\d+ dùng phòng A\.10\.01 đã đến giờ bắt đầu mà chưa được duyệt xong nên đã hết hạn\.$/);
    expect(ctx.db.audit.find((a) => a.action === 'REQUEST_EXPIRED')).toMatchObject({ userId: null, entityId: due });
    expect(await ctx.service.expireOverdue()).toBe(0); // chạy lại không xử lý lần hai
    const cancel = await request(ctx.app).post(`/api/requests/${due}/cancel`).set(ctx.requester.auth).send({});
    expect(cancel.status).toBe(409);
  });

  test('lọc danh sách theo trạng thái EXPIRED', async () => {
    const ctx = setup();
    await submitted(ctx);
    ctx.clock.now = fromVN(2026, 11, 10, 8);
    await ctx.service.expireOverdue();
    const list = await request(ctx.app).get('/api/requests?status=EXPIRED').set(ctx.requester.auth);
    expect(list.body.items.map((r) => r.status)).toEqual(['EXPIRED']);
  });
});

describe('SCRUM-32: chi tiết phiếu có lý do và thời điểm quyết định của từng cấp', () => {
  test('người đăng ký thấy lý do từ chối và thời điểm; bước chưa xử lý có giá trị null', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    const before = (await request(ctx.app).get(`/api/requests/${id}`).set(ctx.requester.auth)).body.request.steps;
    expect(before.map((s) => [s.decisionReason, s.decidedAt])).toEqual([[null, null], [null, null]]);
    await request(ctx.app).post(`/api/requests/${id}/reject`).set(ctx.pdt.auth).send({ reason: 'Trùng hội nghị khoa' });
    const [first, second] = (await request(ctx.app).get(`/api/requests/${id}`).set(ctx.requester.auth)).body.request.steps;
    expect(first).toMatchObject({ status: 'REJECTED', decisionReason: 'Trùng hội nghị khoa' });
    expect(Number.isNaN(Date.parse(first.decidedAt))).toBe(false);
    expect(second).toMatchObject({ status: 'CANCELLED', decisionReason: null, decidedAt: null });
  });

  test('đồng ý kèm ghi chú cũng trả ghi chú và thời điểm', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    await request(ctx.app).post(`/api/requests/${id}/approve`).set(ctx.pdt.auth).send({ reason: 'Đủ điều kiện' });
    const [first] = (await request(ctx.app).get(`/api/requests/${id}`).set(ctx.requester.auth)).body.request.steps;
    expect(first).toMatchObject({ status: 'APPROVED', decisionReason: 'Đủ điều kiện' });
    expect(first.decidedAt).toEqual(expect.any(String));
  });
});

describe('SCRUM-33: lớp mới trùng phòng, trùng giờ với lớp đang có hiệu lực từ lần nhập trước', () => {
  const file = (rows) => Buffer.from([COLUMNS.join(','), ...rows].join('\n'), 'utf8');
  // Thứ ba 03/11/2026: lớp A tiết 1 đến 3 (07:00 đến 09:15), lớp B tiết 2 đến 3 (07:45 đến 09:15) cùng phòng.
  const A = (sem) => [sem, 'TRUNGA', 'Môn A', 'K-A', '3', '1', '3', 'A.10.01', '03/11/2026', '03/11/2026'].join(',');
  const Bx = (sem) => [sem, 'TRUNGB', 'Môn B', 'K-B', '3', '2', '2', 'A.10.01', '03/11/2026', '03/11/2026'].join(',');
  const importIt = (ctx, row, semester, mode) => request(ctx.app).post('/api/class-schedule/imports').set(ctx.pdt.auth).field({ semester, mode }).attach('file', file([row]), 'tkb.csv');
  const commit = (ctx, id) => request(ctx.app).post(`/api/class-schedule/imports/${id}/commit`).set(ctx.pdt.auth);

  test('kiểm tra tệp báo lỗi theo dòng khi trùng lớp đang có hiệu lực của học kỳ khác hoặc ở chế độ thêm mới', async () => {
    const ctx = setup();
    const a = await importIt(ctx, A('HK1'), 'HK1', 'APPEND');
    expect((await commit(ctx, a.body.batchId)).status).toBe(200);
    for (const [sem, mode] of [['HK2', 'APPEND'], ['HK2', 'REPLACE'], ['HK1', 'APPEND']]) {
      const b = await importIt(ctx, Bx(sem), sem, mode);
      expect([b.status, b.body.error.code]).toEqual([422, 'IMPORT_INVALID']);
      expect(b.body.error.details).toEqual([{ row: 2, column: 'Mã phòng', message: 'Trùng giờ với lớp TRUNGA (K-A) đang có hiệu lực trên phòng A.10.01 lúc 07:00 03/11/2026.' }]);
    }
  });

  test('chế độ thay thế cùng học kỳ không tính các lớp sẽ bị thay', async () => {
    const ctx = setup();
    const a = await importIt(ctx, A('HK1'), 'HK1', 'APPEND');
    await commit(ctx, a.body.batchId);
    const b = await importIt(ctx, Bx('HK1'), 'HK1', 'REPLACE');
    expect(b.status).toBe(201);
    const done = await commit(ctx, b.body.batchId);
    expect(done.body).toMatchObject({ activatedSessions: 1, replacedSessions: 1 });
  });

  test('hai bản xem trước trùng nhau: xác nhận bản thứ hai bị chặn ROOM_CONFLICT và vẫn ở trạng thái xem trước', async () => {
    const ctx = setup();
    const a = await importIt(ctx, A('HK1'), 'HK1', 'APPEND');
    const b = await importIt(ctx, Bx('HK2'), 'HK2', 'APPEND');
    expect(b.status).toBe(201);
    expect((await commit(ctx, a.body.batchId)).status).toBe(200);
    const res = await commit(ctx, b.body.batchId);
    expect([res.status, res.body.error.code]).toEqual([409, 'ROOM_CONFLICT']);
    expect(res.body.error.message).toBe('Lớp TRUNGB (K-B) trùng giờ với lớp TRUNGA (K-A) đang có hiệu lực trên phòng A.10.01. Hãy hủy bản xem trước và nhập lại.');
    expect(ctx.db.batches.find((x) => x.id === b.body.batchId).status).toBe('PREVIEW');
  });
});
