const request = require('supertest');
const { createApp } = require('../../src/app');
const { fakeDb, login, addRoom, fakeStorage } = require('../helpers');
const { fromVN } = require('../../src/timeVN');

const CNTT = '00000000-0000-4000-9000-0000000000a1';
const PDT = '00000000-0000-4000-9000-0000000000a2';
const BGH = '00000000-0000-4000-9000-0000000000a3';
const CSVC = '00000000-0000-4000-9000-0000000000a4';
const NOW = fromVN(2026, 11, 2, 8);
const day = (d, h) => fromVN(2026, 11, d, h).toISOString();

function setup() {
  const db = fakeDb();
  const room = addRoom(db, { code: 'A.10.01', capacity: 80 });
  const app = createApp({ db, storage: fakeStorage(), clock: () => NOW });
  return { db, app, room, requester: login(db, 'REQUESTER'), pdt: login(db, 'APPROVER', PDT), csvc: login(db, 'APPROVER', CSVC), bgh: login(db, 'APPROVER', BGH), admin: login(db, 'ADMIN') };
}

// Phiếu đã gửi (PENDING) vào thứ hai 09/11/2026, chuỗi duyệt Phòng Đào tạo rồi Phòng Quản trị cơ sở vật chất.
async function submitted({ app, room, requester }, { start = 8, end = 10 } = {}) {
  const body = { organizationId: CNTT, roomId: room.id, purpose: 'Thử', startAt: day(9, start), endAt: day(9, end), participantCount: 30 };
  const id = (await request(app).post('/api/requests').set(requester.auth).send(body)).body.request.id;
  await request(app).post(`/api/requests/${id}/submit`).set(requester.auth);
  return id;
}
const approve = (ctx, who, id, body = {}) => request(ctx.app).post(`/api/requests/${id}/approve`).set(who.auth).send(body);
const reject = (ctx, who, id, body = {}) => request(ctx.app).post(`/api/requests/${id}/reject`).set(who.auth).send(body);

describe('duyệt theo chuỗi đơn vị (FR-10)', () => {
  test('mỗi đơn vị chỉ thấy phiếu đang chờ mình, duyệt xong bước thì phiếu chuyển sang đơn vị kế tiếp', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    const list = (who) => request(ctx.app).get('/api/approvals').set(who.auth);
    expect((await list(ctx.pdt)).body).toMatchObject({ total: 1 });
    expect((await list(ctx.csvc)).body.total).toBe(0);

    const first = await approve(ctx, ctx.pdt, id, { reason: 'Đủ điều kiện' });
    expect(first.status).toBe(200);
    expect(first.body.request.status).toBe('PENDING');
    expect(first.body.request.steps.map((s) => s.status)).toEqual(['APPROVED', 'PENDING']);
    expect((await list(ctx.pdt)).body.total).toBe(0);
    expect((await list(ctx.csvc)).body.total).toBe(1);
    expect(ctx.db.bookings).toHaveLength(0);
  });

  test('bước cuối tạo lượt đặt ACTIVE, phiếu thành APPROVED và người đăng ký nhận thông báo', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    await approve(ctx, ctx.pdt, id);
    const done = await approve(ctx, ctx.csvc, id);
    expect(done.body.request.status).toBe('APPROVED');
    expect(ctx.db.bookings).toEqual([expect.objectContaining({ requestId: id, roomId: ctx.room.id, status: 'ACTIVE' })]);
    const inbox = (await request(ctx.app).get('/api/notifications').set(ctx.requester.auth)).body;
    expect(inbox.items[0]).toMatchObject({ requestId: id, title: 'Yêu cầu sử dụng phòng đã được duyệt' });
    expect(ctx.db.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['REQUEST_STEP_APPROVED', 'REQUEST_APPROVED']));
  });

  test('phiếu từ 200 người có thêm bước Ban Giám hiệu ở giữa', async () => {
    const ctx = setup();
    ctx.room.capacity = 300;
    const body = { organizationId: CNTT, roomId: ctx.room.id, purpose: 'Hội nghị', startAt: day(9, 8), endAt: day(9, 10), participantCount: 250 };
    const id = (await request(ctx.app).post('/api/requests').set(ctx.requester.auth).send(body)).body.request.id;
    await request(ctx.app).post(`/api/requests/${id}/attachments`).set(ctx.requester.auth).attach('file', Buffer.from('%PDF-1.4 x'), 'bgh.pdf');
    await request(ctx.app).post(`/api/requests/${id}/submit`).set(ctx.requester.auth);
    await approve(ctx, ctx.pdt, id);
    expect((await approve(ctx, ctx.csvc, id)).status).toBe(403);
    expect((await approve(ctx, ctx.bgh, id)).body.request.steps.map((s) => s.status)).toEqual(['APPROVED', 'APPROVED', 'PENDING']);
  });
});

describe('kiểm tra lại trước khi cấp cuối đồng ý (SCRUM-13)', () => {
  test('lịch học chính khóa xuất hiện sau khi gửi thì bước cuối không cho duyệt, các bước trước vẫn giữ nguyên', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    await approve(ctx, ctx.pdt, id);
    ctx.db.sessions.push({ id: 's1', roomId: ctx.room.id, status: 'ACTIVE', startAt: new Date(day(9, 9)), endAt: new Date(day(9, 11)), courseCode: 'IT001', classCode: 'K29' });
    const res = await approve(ctx, ctx.csvc, id);
    expect([res.status, res.body.error.code, res.body.error.details[0].source]).toEqual([409, 'ROOM_CONFLICT', 'CLASS_SCHEDULE']);
    expect(ctx.db.bookings).toHaveLength(0);
    const after = await request(ctx.app).get(`/api/requests/${id}`).set(ctx.admin.auth);
    expect([after.body.request.status, after.body.request.steps.map((s) => s.status)]).toEqual(['PENDING', ['APPROVED', 'PENDING']]);
  });

  test('hai phiếu cùng phòng cùng giờ: phiếu thứ nhất duyệt xong thì phiếu thứ hai không thể duyệt', async () => {
    const ctx = setup();
    const a = await submitted(ctx);
    const other = { ...ctx, requester: login(ctx.db, 'REQUESTER') };
    const b = await submitted(other, { start: 9 });
    for (const id of [a, b]) await approve(ctx, ctx.pdt, id);
    expect((await approve(ctx, ctx.csvc, a)).body.request.status).toBe('APPROVED');
    const res = await approve(ctx, ctx.csvc, b);
    expect([res.status, res.body.error.code, res.body.error.details[0].source]).toEqual([409, 'ROOM_CONFLICT', 'ROOM_BOOKING']);
  });

  test('phòng chuyển sang bảo trì sau khi gửi thì bước cuối trả ROOM_UNAVAILABLE', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    await approve(ctx, ctx.pdt, id);
    ctx.room.status = 'MAINTENANCE';
    ctx.db.requests[0].room.status = 'MAINTENANCE';
    expect((await approve(ctx, ctx.csvc, id)).body.error.code).toBe('ROOM_UNAVAILABLE');
  });

  test('chốt chặn cuối của cơ sở dữ liệu: trùng xảy ra giữa lúc kiểm tra và lúc ghi vẫn trả ROOM_CONFLICT', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    await approve(ctx, ctx.pdt, id);
    const real = ctx.db.approveStep;
    ctx.db.approveStep = async () => 'CONFLICT';
    const res = await approve(ctx, ctx.csvc, id);
    ctx.db.approveStep = real;
    expect([res.status, res.body.error.code]).toEqual([409, 'ROOM_CONFLICT']);
  });
});

describe('từ chối và phân quyền', () => {
  test('từ chối bắt buộc có lý do, phiếu thành REJECTED, các bước sau bị hủy, người đăng ký nhận thông báo kèm lý do', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    const bad = await reject(ctx, ctx.pdt, id, { reason: '   ' });
    expect([bad.status, bad.body.error.details[0].field]).toEqual([400, 'reason']);
    const res = await reject(ctx, ctx.pdt, id, { reason: 'Trùng sự kiện của trường' });
    expect(res.body.request).toMatchObject({ status: 'REJECTED' });
    expect(res.body.request.steps.map((s) => s.status)).toEqual(['REJECTED', 'CANCELLED']);
    const inbox = (await request(ctx.app).get('/api/notifications').set(ctx.requester.auth)).body;
    expect(inbox.items[0].message).toContain('Trùng sự kiện của trường');
    expect((await approve(ctx, ctx.pdt, id)).status).toBe(409);
  });

  test('chỉ APPROVER mới duyệt; đơn vị không đúng bước, phiếu không tồn tại, phiếu chưa gửi, id sai đều bị từ chối', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    for (const who of [ctx.requester, ctx.admin]) expect((await approve(ctx, who, id)).status).toBe(403);
    expect((await request(ctx.app).get('/api/approvals').set(ctx.requester.auth)).status).toBe(403);
    expect((await request(ctx.app).get('/api/approvals')).status).toBe(401);
    expect((await approve(ctx, ctx.csvc, id)).status).toBe(403); // chưa tới lượt
    expect((await approve(ctx, ctx.pdt, 'abc')).status).toBe(404);
    expect((await approve(ctx, ctx.pdt, '00000000-0000-4000-8000-000000000001')).status).toBe(404);
    const draft = (await request(ctx.app).post('/api/requests').set(ctx.requester.auth).send({ organizationId: CNTT, roomId: ctx.room.id, purpose: 'Nháp', startAt: day(10, 8), endAt: day(10, 9), participantCount: 5 })).body.request.id;
    expect((await approve(ctx, ctx.pdt, draft)).status).toBe(409);
  });
});
