const request = require('supertest');
const { createApp } = require('../../src/app');
const { fakeDb, login, addRoom, fakeStorage } = require('../helpers');
const { fromVN } = require('../../src/timeVN');

const NOW = fromVN(2026, 11, 2, 8);
const day = (d, h) => fromVN(2026, 11, d, h).toISOString();

function setup() {
  const db = fakeDb();
  const storage = fakeStorage();
  const app = createApp({ db, storage, clock: () => NOW });
  const room = addRoom(db, { capacity: 80 });
  const body = (over = {}) => ({ organizationId: '00000000-0000-4000-9000-0000000000a1', roomId: room.id, purpose: 'Sinh hoạt chuyên đề', startAt: day(12, 8), endAt: day(12, 10), participantCount: 40, equipment: [{ itemType: 'MICROPHONE', quantity: 2 }], ...over });
  return { db, app, storage, room, body, who: login(db, 'REQUESTER').auth };
}

describe('phân quyền API yêu cầu (NFR-04)', () => {
  test('chưa đăng nhập 401; chỉ REQUESTER tạo, sửa, gửi, hủy được', async () => {
    const { db, app, body, who } = setup();
    expect((await request(app).post('/api/requests').send(body())).status).toBe(401);
    for (const role of ['APPROVER', 'FACILITY_STAFF', 'ADMIN']) {
      const { auth } = login(db, role, '00000000-0000-4000-9000-0000000000a4');
      const res = await request(app).post('/api/requests').set(auth).send(body());
      expect([role, res.status, res.body.error.code]).toEqual([role, 403, 'FORBIDDEN']);
    }
    const created = await request(app).post('/api/requests').set(who).send(body());
    expect(created.status).toBe(201);
    for (const role of ['APPROVER', 'FACILITY_STAFF', 'ADMIN']) {
      const { auth } = login(db, role, '00000000-0000-4000-9000-0000000000a4');
      for (const [method, path] of [['patch', ''], ['post', '/submit'], ['post', '/cancel'], ['post', '/attachments']]) {
        expect([role, path, (await request(app)[method](`/api/requests/${created.body.request.id}${path}`).set(auth).send({})).status]).toEqual([role, path, 403]);
      }
    }
  });

  test('xem chi tiết: chủ phiếu, ADMIN, FACILITY_STAFF; người đăng ký khác và APPROVER bị chặn', async () => {
    const { db, app, body, who } = setup();
    const id = (await request(app).post('/api/requests').set(who).send(body())).body.request.id;
    const get = (auth) => request(app).get(`/api/requests/${id}`).set(auth);
    expect((await get(who)).status).toBe(200);
    expect((await get(login(db, 'ADMIN').auth)).status).toBe(200);
    expect((await get(login(db, 'FACILITY_STAFF').auth)).status).toBe(200);
    expect((await get(login(db, 'REQUESTER').auth)).status).toBe(404);
    expect((await get(login(db, 'APPROVER').auth)).status).toBe(403);
  });
});

describe('luồng tạo, đính kèm, gửi', () => {
  test('tạo nháp, gửi, nhận phiếu PENDING kèm bước duyệt; danh sách chỉ có phiếu của mình', async () => {
    const { app, body, who, db } = setup();
    const created = await request(app).post('/api/requests').set(who).send(body());
    expect(created.body.request).toMatchObject({ code: 'REQ-001', status: 'DRAFT', startAt: day(12, 8), participantCount: 40 });
    const sent = await request(app).post(`/api/requests/${created.body.request.id}/submit`).set(who);
    expect(sent.status).toBe(200);
    expect(sent.body.request.steps[0]).toEqual({ order: 1, organizationName: 'Phòng Đào tạo', status: 'PENDING' });
    const mine = await request(app).get('/api/requests').set(who);
    expect(mine.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect((await request(app).get('/api/requests').set(login(db, 'REQUESTER').auth)).body.total).toBe(0);
    expect((await request(app).get('/api/requests').set(login(db, 'ADMIN').auth)).body.total).toBe(1);
  });

  test('lỗi nghiệp vụ trả đúng mã HTTP và mã lỗi theo API Contract', async () => {
    const { app, body, who } = setup();
    const send = async (over) => {
      const id = (await request(app).post('/api/requests').set(who).send(body(over))).body.request.id;
      const res = await request(app).post(`/api/requests/${id}/submit`).set(who);
      return [res.status, res.body.error.code];
    };
    expect(await send({ startAt: day(3, 8), endAt: day(3, 10) })).toEqual([422, 'LEAD_TIME_VIOLATION']);
    expect(await send({ startAt: day(12, 20), endAt: day(12, 22) })).toEqual([422, 'AFTER_HOURS_LIMIT']);
    expect(await send({ participantCount: 100 })).toEqual([422, 'CAPACITY_EXCEEDED']);
  });

  test('dữ liệu sai báo 400 kèm trường, tên trường thiết bị theo dòng', async () => {
    const { app, who } = setup();
    const res = await request(app).post('/api/requests').set(who).send({ purpose: ' ', equipment: [{ itemType: 'OTHER' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['organizationId', 'roomId', 'purpose', 'startAt', 'participantCount', 'equipment.0.otherDescription']));
  });

  test('đính kèm tệp bằng multipart: nhận PDF, từ chối .exe 415, tệp quá 5 MB 413, thiếu trường file 400', async () => {
    const { app, body, who, storage } = setup();
    const id = (await request(app).post('/api/requests').set(who).send(body())).body.request.id;
    const url = `/api/requests/${id}/attachments`;
    const ok = await request(app).post(url).set(who).attach('file', Buffer.from('%PDF-1.4'), 'KeHoach.pdf');
    expect([ok.status, ok.body.request.attachments[0].fileName]).toEqual([201, 'KeHoach.pdf']);
    expect(storage.saved).toHaveLength(1);
    expect((await request(app).post(url).set(who).attach('file', Buffer.from('MZ'), 'virus.exe')).body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    const big = await request(app).post(url).set(who).attach('file', Buffer.alloc(5 * 1024 * 1024 + 10), 'to.pdf');
    expect([big.status, big.body.error.code]).toEqual([413, 'FILE_TOO_LARGE']);
    expect((await request(app).post(url).set(who).send({})).status).toBe(400);
    const wrongField = await request(app).post(url).set(who).attach('khac', Buffer.from('x'), 'a.pdf');
    expect(wrongField.status).toBe(400);
  });

  test('id không phải UUID hoặc không tồn tại trả 404, hủy rồi hủy lại 409', async () => {
    const { app, body, who } = setup();
    expect((await request(app).get('/api/requests/abc').set(who)).status).toBe(404);
    expect((await request(app).post('/api/requests/abc/submit').set(who)).status).toBe(404);
    const id = (await request(app).post('/api/requests').set(who).send(body())).body.request.id;
    expect((await request(app).post(`/api/requests/${id}/cancel`).set(who).send({ reason: 'Đổi kế hoạch' })).body.request).toMatchObject({ status: 'CANCELLED', cancelReason: 'Đổi kế hoạch' });
    expect((await request(app).post(`/api/requests/${id}/cancel`).set(who).send({})).status).toBe(409);
  });
});
