const request = require('supertest');
const { createApp } = require('../../src/app');
const { fakeDb, login, addRoom } = require('../helpers');
const { COLUMNS } = require('../../src/validators/schedule');

const PDT = '00000000-0000-4000-9000-0000000000a2';
const CNTT = '00000000-0000-4000-9000-0000000000a1';
const GOOD = ['HK1 2026-2027', 'IT001', 'Lập trình Web', 'K29-SE01', '2', '1', '3', 'A.10.01', '02/11/2026', '16/11/2026'].join(',');
const file = (rows) => Buffer.from([COLUMNS.join(','), ...rows].join('\n'), 'utf8');

function setup() {
  const db = fakeDb();
  addRoom(db, { code: 'A.10.01' });
  const app = createApp({ db });
  return { db, app, admin: login(db, 'ADMIN').auth, pdt: login(db, 'APPROVER', PDT).auth };
}
const importIt = (app, auth, rows = [GOOD], fields = { semester: 'HK1 2026-2027', mode: 'REPLACE' }) =>
  request(app).post('/api/class-schedule/imports').set(auth).field(fields).attach('file', file(rows), 'tkb.csv');

describe('phân quyền lịch học chính khóa (BR-12, NFR-04)', () => {
  const paths = [
    ['get', '/api/class-schedule/template'],
    ['get', '/api/class-schedule/imports'],
    ['get', '/api/class-schedule'],
    ['post', '/api/class-schedule/imports'],
    ['post', '/api/class-schedule/imports/x/commit'],
    ['delete', '/api/class-schedule/imports/x'],
    ['patch', '/api/class-schedule/x'],
    ['post', '/api/class-schedule/x/cancel'],
  ];

  test('chưa đăng nhập 401', async () => {
    const { app } = setup();
    for (const [m, p] of paths) expect([m, p, (await request(app)[m](p)).status]).toEqual([m, p, 401]);
  });

  test('người đăng ký, nhân viên cơ sở vật chất, cán bộ duyệt không thuộc Phòng Đào tạo đều bị 403 ở mọi API', async () => {
    const { app, db } = setup();
    const others = [login(db, 'REQUESTER').auth, login(db, 'FACILITY_STAFF', '00000000-0000-4000-9000-0000000000a4').auth, login(db, 'APPROVER', '00000000-0000-4000-9000-0000000000a3').auth, login(db, 'APPROVER', CNTT).auth];
    for (const auth of others) for (const [m, p] of paths) expect([m, p, (await request(app)[m](p).set(auth)).status]).toEqual([m, p, 403]);
  });

  test('ADMIN và cán bộ Phòng Đào tạo dùng được; khung tiết thì mọi vai trò xem được', async () => {
    const { app, admin, pdt, db } = setup();
    expect((await request(app).get('/api/class-schedule').set(admin)).status).toBe(200);
    expect((await request(app).get('/api/class-schedule').set(pdt)).status).toBe(200);
    const slots = await request(app).get('/api/period-slots').set(login(db, 'REQUESTER').auth);
    expect(slots.body.items).toHaveLength(12);
    expect((await request(app).get('/api/period-slots')).status).toBe(401);
  });
});

describe('luồng nhập thời khóa biểu qua HTTP', () => {
  test('tải tệp mẫu CSV đúng 10 cột có BOM', async () => {
    const { app, pdt } = setup();
    const res = await request(app).get('/api/class-schedule/template').set(pdt);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="thoi-khoa-bieu-mau\.csv"/);
    expect(res.text.replace(/^﻿/, '').split('\n')[0]).toBe(COLUMNS.join(','));
  });

  test('tệp đúng tạo bản xem trước 201, xác nhận thì buổi học hiện trong tra cứu, bản xem trước thì không', async () => {
    const { app, pdt } = setup();
    const preview = await importIt(app, pdt);
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({ status: 'PREVIEW', rowCount: 1, sessionCount: 3, conflicts: [] });
    expect((await request(app).get('/api/class-schedule').set(pdt)).body.total).toBe(0);
    const done = await request(app).post(`/api/class-schedule/imports/${preview.body.batchId}/commit`).set(pdt);
    expect(done.body).toMatchObject({ status: 'COMMITTED', activatedSessions: 3, replacedSessions: 0, cancelledRequests: [] });
    const list = await request(app).get('/api/class-schedule?from=2026-11-02&to=2026-11-09').set(pdt);
    expect(list.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(list.body.items[0]).toMatchObject({ roomCode: 'A.10.01', courseCode: 'IT001', classCode: 'K29-SE01', status: 'ACTIVE' });
  });

  test('tệp có dòng sai trả 422 IMPORT_INVALID kèm lỗi từng dòng, và không tạo bản xem trước', async () => {
    const { app, pdt, db } = setup();
    const bad = GOOD.replace('A.10.01', 'Z.9');
    const res = await importIt(app, pdt, [GOOD, bad]);
    expect([res.status, res.body.error.code]).toEqual([422, 'IMPORT_INVALID']);
    expect(res.body.error.details).toEqual([{ row: 3, column: 'Mã phòng', message: 'Không có trong hệ thống.' }]);
    expect(db.batches).toHaveLength(0);
  });

  test('thiếu tệp 400, đuôi lạ 415, tệp quá 5 MB 413, thiếu học kỳ 400', async () => {
    const { app, pdt } = setup();
    expect((await request(app).post('/api/class-schedule/imports').set(pdt).field({ semester: 'HK1 2026-2027', mode: 'REPLACE' })).status).toBe(400);
    const pdf = await request(app).post('/api/class-schedule/imports').set(pdt).field({ semester: 'HK1 2026-2027', mode: 'REPLACE' }).attach('file', Buffer.from('x'), 'a.pdf');
    expect([pdf.status, pdf.body.error.code]).toEqual([415, 'UNSUPPORTED_FILE_TYPE']);
    const big = await request(app).post('/api/class-schedule/imports').set(pdt).field({ semester: 'HK1 2026-2027', mode: 'REPLACE' }).attach('file', Buffer.alloc(5 * 1024 * 1024 + 10), 'a.csv');
    expect([big.status, big.body.error.code]).toEqual([413, 'FILE_TOO_LARGE']);
    expect((await importIt(app, pdt, [GOOD], { mode: 'REPLACE' })).body.error.details[0].field).toBe('semester');
  });

  test('hủy bản xem trước 204, hủy lần hai 409, id lạ 404; sửa và hủy buổi học', async () => {
    const { app, pdt } = setup();
    const p1 = await importIt(app, pdt);
    expect((await request(app).delete(`/api/class-schedule/imports/${p1.body.batchId}`).set(pdt)).status).toBe(204);
    expect((await request(app).delete(`/api/class-schedule/imports/${p1.body.batchId}`).set(pdt)).status).toBe(409);
    expect((await request(app).get('/api/class-schedule/imports/abc').set(pdt)).status).toBe(404);
    const p2 = await importIt(app, pdt);
    await request(app).post(`/api/class-schedule/imports/${p2.body.batchId}/commit`).set(pdt);
    const first = (await request(app).get('/api/class-schedule').set(pdt)).body.items[0];
    const moved = await request(app).patch(`/api/class-schedule/${first.id}`).set(pdt).send({ endAt: '2026-11-02T03:00:00Z' });
    expect([moved.status, moved.body.session.endAt]).toEqual([200, '2026-11-02T03:00:00.000Z']);
    expect((await request(app).patch(`/api/class-schedule/${first.id}`).set(pdt).send({ endAt: 'hôm nay' })).status).toBe(400);
    expect((await request(app).post(`/api/class-schedule/${first.id}/cancel`).set(pdt)).body.session.status).toBe('CANCELLED');
    expect((await request(app).post(`/api/class-schedule/${first.id}/cancel`).set(pdt)).status).toBe(409);
    expect((await request(app).get('/api/class-schedule/imports').set(pdt)).body.items.map((b) => b.status)).toEqual(['COMMITTED', 'DISCARDED']);
  });
});
