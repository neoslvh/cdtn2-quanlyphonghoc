const request = require('supertest');
const { createApp } = require('../../src/app');
const { fakeDb, login, addRoom, fakeStorage } = require('../helpers');
const { fromVN } = require('../../src/timeVN');
const { COLUMNS } = require('../../src/validators/schedule');

const PDT = '00000000-0000-4000-9000-0000000000a2';
const CNTT = '00000000-0000-4000-9000-0000000000a1';
const NOW = fromVN(2026, 11, 2, 8);
const day = (d, h) => fromVN(2026, 11, d, h).toISOString();

function setup() {
  const db = fakeDb();
  const room = addRoom(db, { code: 'A.10.01', capacity: 80 });
  const app = createApp({ db, storage: fakeStorage(), clock: () => NOW });
  return { db, app, room, requester: login(db, 'REQUESTER'), pdt: login(db, 'APPROVER', PDT), admin: login(db, 'ADMIN') };
}

// Phiếu của người đăng ký vào thứ hai 09/11/2026 08:00 đến 10:00, đã gửi (PENDING).
async function pendingRequest({ app, room, requester }) {
  const body = { organizationId: CNTT, roomId: room.id, purpose: 'Thử', startAt: day(9, 8), endAt: day(9, 10), participantCount: 30 };
  const id = (await request(app).post('/api/requests').set(requester.auth).send(body)).body.request.id;
  await request(app).post(`/api/requests/${id}/submit`).set(requester.auth);
  return id;
}
const csv = Buffer.from([COLUMNS.join(','), ['HK1 2026-2027', 'IT001', 'Lập trình Web', 'K29-SE01', '2', '1', '3', 'A.10.01', '09/11/2026', '16/11/2026'].join(',')].join('\n'));
const importAndCommit = async ({ app, pdt }) => {
  const p = await request(app).post('/api/class-schedule/imports').set(pdt.auth).field({ semester: 'HK1 2026-2027', mode: 'REPLACE' }).attach('file', csv, 'tkb.csv');
  return request(app).post(`/api/class-schedule/imports/${p.body.batchId}/commit`).set(pdt.auth);
};

describe('thông báo khi thời khóa biểu mới hủy yêu cầu (BR-11, SCRUM-30 AC4)', () => {
  test('người đăng ký có yêu cầu bị trùng nhận thông báo kèm lý do, người khác không nhận', async () => {
    const ctx = setup();
    const other = login(ctx.db, 'REQUESTER');
    const id = await pendingRequest(ctx);
    const done = await importAndCommit(ctx);
    expect(done.body.cancelledRequests).toHaveLength(1);
    const mine = await request(ctx.app).get('/api/notifications').set(ctx.requester.auth);
    expect(mine.body).toMatchObject({ total: 1, unread: 1 });
    expect(mine.body.items[0]).toMatchObject({ requestId: id, title: 'Yêu cầu sử dụng phòng bị hủy', read: false });
    expect(mine.body.items[0].message).toBe('Phòng A.10.01 có lớp IT001 (K29-SE01) theo thời khóa biểu mới của Phòng Đào tạo.');
    expect((await request(ctx.app).get('/api/notifications').set(other.auth)).body.total).toBe(0);
  });

  test('đánh dấu đã đọc từng thông báo và tất cả, thông báo của người khác trả 404, lọc chưa đọc', async () => {
    const ctx = setup();
    await pendingRequest(ctx);
    await importAndCommit(ctx);
    const n = (await request(ctx.app).get('/api/notifications').set(ctx.requester.auth)).body.items[0];
    const stranger = login(ctx.db, 'REQUESTER').auth;
    expect((await request(ctx.app).patch(`/api/notifications/${n.id}/read`).set(stranger)).status).toBe(404);
    expect((await request(ctx.app).patch('/api/notifications/abc/read').set(ctx.requester.auth)).status).toBe(404);
    const read = await request(ctx.app).patch(`/api/notifications/${n.id}/read`).set(ctx.requester.auth);
    expect(read.body.notification.read).toBe(true);
    const unread = await request(ctx.app).get('/api/notifications?unread=true').set(ctx.requester.auth);
    expect(unread.body).toMatchObject({ total: 0, unread: 0 });
    expect((await request(ctx.app).post('/api/notifications/read-all').set(ctx.requester.auth)).body).toEqual({ updated: 0 });
    expect((await request(ctx.app).get('/api/notifications')).status).toBe(401);
  });
});

describe('nhật ký thao tác (FR-21, SCRUM-30 AC6)', () => {
  test('mỗi lần nhập, sửa, hủy buổi học và hủy yêu cầu do lịch đều có nhật ký kèm người thực hiện', async () => {
    const ctx = setup();
    await pendingRequest(ctx);
    await importAndCommit(ctx);
    const session = (await request(ctx.app).get('/api/class-schedule').set(ctx.pdt.auth)).body.items[0];
    await request(ctx.app).patch(`/api/class-schedule/${session.id}`).set(ctx.pdt.auth).send({ endAt: '2026-11-09T03:00:00Z' });
    await request(ctx.app).post(`/api/class-schedule/${session.id}/cancel`).set(ctx.pdt.auth);
    const log = await request(ctx.app).get('/api/audit-logs?pageSize=50').set(ctx.admin.auth);
    const actions = log.body.items.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['REQUEST_CREATED', 'REQUEST_SUBMITTED', 'SCHEDULE_IMPORT_PREVIEWED', 'SCHEDULE_IMPORT_COMMITTED', 'REQUEST_CANCELLED_BY_SCHEDULE', 'CLASS_SESSION_UPDATED', 'CLASS_SESSION_CANCELLED']));
    const committed = ctx.db.audit.find((a) => a.action === 'SCHEDULE_IMPORT_COMMITTED');
    expect(committed.userId).toBe(ctx.pdt.user.id);
  });

  test('tra cứu theo hành động và người thực hiện; chỉ ADMIN xem được; tham số sai trả 400', async () => {
    const ctx = setup();
    await pendingRequest(ctx);
    const submitted = await request(ctx.app).get('/api/audit-logs?action=REQUEST_SUBMITTED').set(ctx.admin.auth);
    expect(submitted.body.items.map((a) => a.action)).toEqual(['REQUEST_SUBMITTED']);
    expect((await request(ctx.app).get('/api/audit-logs').set(ctx.pdt.auth)).status).toBe(403);
    expect((await request(ctx.app).get('/api/audit-logs').set(ctx.requester.auth)).status).toBe(403);
    expect((await request(ctx.app).get('/api/audit-logs')).status).toBe(401);
    const bad = await request(ctx.app).get('/api/audit-logs?entityId=abc&userId=xyz').set(ctx.admin.auth);
    expect([bad.status, bad.body.error.details.map((d) => d.field)]).toEqual([400, ['entityId', 'userId']]);
  });

  test('thêm và sửa phòng, hủy phiếu cũng được ghi nhật ký', async () => {
    const ctx = setup();
    const staff = login(ctx.db, 'FACILITY_STAFF', '00000000-0000-4000-9000-0000000000a4');
    const room = { code: 'B.01.01', name: 'Phòng B', campus: 'Cơ sở 1', roomType: 'LAB', capacity: 30, status: 'AVAILABLE' };
    const created = (await request(ctx.app).post('/api/rooms').set(staff.auth).send(room)).body.room;
    await request(ctx.app).patch(`/api/rooms/${created.id}`).set(staff.auth).send({ ...room, status: 'MAINTENANCE' });
    const id = await pendingRequest(ctx);
    await request(ctx.app).post(`/api/requests/${id}/cancel`).set(ctx.requester.auth).send({ reason: 'Đổi lịch' });
    const actions = ctx.db.audit.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['ROOM_CREATED', 'ROOM_UPDATED', 'REQUEST_CANCELLED']));
    expect(ctx.db.audit.find((a) => a.action === 'ROOM_UPDATED').after.status).toBe('MAINTENANCE');
  });
});
