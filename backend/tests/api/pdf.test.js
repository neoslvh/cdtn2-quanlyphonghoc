const request = require('supertest');
const { createApp } = require('../../src/app');
const { fromVN } = require('../../src/timeVN');
const { fakeDb, login, addRoom, fakeStorage } = require('../helpers');

// SCRUM-20: tải phiếu đề xuất dạng PDF khi đã duyệt hoàn tất.
const CNTT = '00000000-0000-4000-9000-0000000000a1';
const PDT = '00000000-0000-4000-9000-0000000000a2';

function setup() {
  const db = fakeDb();
  const room = addRoom(db, { code: 'A.10.01', capacity: 80 });
  const clock = { now: fromVN(2026, 11, 2, 8) };
  const app = createApp({ db, storage: fakeStorage(), clock: () => clock.now });
  return { db, app, room, requester: login(db, 'REQUESTER'), stranger: login(db, 'REQUESTER'), staff: login(db, 'FACILITY_STAFF'), admin: login(db, 'ADMIN'), pdt: login(db, 'APPROVER', PDT) };
}
async function submitted(ctx) {
  const body = { organizationId: CNTT, roomId: ctx.room.id, purpose: 'Hội thảo khoa', startAt: fromVN(2026, 11, 9, 8).toISOString(), endAt: fromVN(2026, 11, 9, 10).toISOString(), participantCount: 30, equipment: [{ itemType: 'OTHER', quantity: 1, otherDescription: 'Bảng di động' }] };
  const id = (await request(ctx.app).post('/api/requests').set(ctx.requester.auth).send(body)).body.request.id;
  await request(ctx.app).post(`/api/requests/${id}/submit`).set(ctx.requester.auth);
  return id;
}
// supertest đọc PDF thành Buffer.
const pdfOf = (req) => req.buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

describe('SCRUM-20: tải phiếu PDF', () => {
  test('phiếu đã duyệt: người đăng ký, nhân viên cơ sở vật chất, quản trị viên tải được tệp PDF tên REQ-xxx.pdf', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    ctx.db.requests.find((r) => r.id === id).status = 'APPROVED';
    for (const who of [ctx.requester, ctx.staff, ctx.admin]) {
      const res = await pdfOf(request(ctx.app).get(`/api/requests/${id}/pdf`).set(who.auth));
      expect([res.status, res.type]).toEqual([200, 'application/pdf']);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="?REQ-\d+\.pdf"?$/);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(res.body.length).toBeGreaterThan(2000);
    }
  });

  test('chưa duyệt hoàn tất thì không xuất được', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    const res = await request(ctx.app).get(`/api/requests/${id}/pdf`).set(ctx.requester.auth);
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([409, 'INVALID_STATE', 'Chỉ xuất phiếu PDF khi yêu cầu đã được duyệt hoàn tất.']);
  });

  test('phiếu của người khác báo không tìm thấy; người duyệt không có quyền tải', async () => {
    const ctx = setup();
    const id = await submitted(ctx);
    ctx.db.requests.find((r) => r.id === id).status = 'APPROVED';
    expect((await request(ctx.app).get(`/api/requests/${id}/pdf`).set(ctx.stranger.auth)).status).toBe(404);
    expect((await request(ctx.app).get(`/api/requests/${id}/pdf`).set(ctx.pdt.auth)).status).toBe(403);
    expect((await request(ctx.app).get('/api/requests/khong-co/pdf').set(ctx.requester.auth)).status).toBe(404);
  });
});
