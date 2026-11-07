const request = require('supertest');
const { createApp } = require('../../src/app');
const { fakeDb, login, addRoom } = require('../helpers');
const { fromVN } = require('../../src/timeVN');

const at = (h) => fromVN(2026, 11, 10, h).toISOString();
const qs = (o) => new URLSearchParams(o).toString();

function setup() {
  const db = fakeDb();
  return { db, app: createApp({ db }) };
}

describe('GET /api/rooms/available', () => {
  test('chưa đăng nhập thì 401', async () => {
    const { app } = setup();
    expect((await request(app).get(`/api/rooms/available?${qs({ from: at(8), to: at(10), capacity: 10 })}`)).status).toBe(401);
  });

  test('mọi vai trò đều tra cứu được, không bị hiểu nhầm là /rooms/:id', async () => {
    const { db, app } = setup();
    addRoom(db);
    for (const role of ['REQUESTER', 'APPROVER', 'FACILITY_STAFF', 'ADMIN']) {
      const { auth } = login(db, role);
      const res = await request(app).get(`/api/rooms/available?${qs({ from: at(8), to: at(10), capacity: 10 })}`).set(auth);
      expect([role, res.status, res.body.total]).toEqual([role, 200, 1]);
    }
  });

  test('phòng có buổi học chính khóa trong khung giờ không xuất hiện', async () => {
    const { db, app } = setup();
    const busy = addRoom(db);
    const free = addRoom(db);
    db.sessions.push({ roomId: busy.id, status: 'ACTIVE', startAt: new Date(at(7)), endAt: new Date(at(9)), courseCode: 'IT001', classCode: 'K29-SE01' });
    const { auth } = login(db, 'REQUESTER');
    const res = await request(app).get(`/api/rooms/available?${qs({ from: at(8), to: at(10), capacity: 10 })}`).set(auth);
    expect(res.body.items.map((r) => r.code)).toEqual([free.code]);
    expect(res.body.items[0]).toMatchObject({ campus: 'Cơ sở 1', roomType: 'CLASSROOM', capacity: 80 });
  });

  test('campus gửi hai lần (thành mảng) trả 400, không phải 500', async () => {
    // Express 5 dùng bộ phân tích query đơn giản nên campus[x]=1 không thành object; trường hợp object đã có ở test unit.
    const { db, app } = setup();
    const { auth } = login(db, 'REQUESTER');
    const res = await request(app).get(`/api/rooms/available?${qs({ from: at(8), to: at(10), capacity: 10 })}&campus=a&campus=b`).set(auth);
    expect([res.status, res.body.error.details[0].field]).toEqual([400, 'campus']);
  });

  test('tham số sai trả 400 kèm trường lỗi để giao diện hiện dưới ô nhập', async () => {
    const { db, app } = setup();
    const { auth } = login(db, 'REQUESTER');
    const res = await request(app).get(`/api/rooms/available?${qs({ from: at(8), to: at(23), capacity: 10 })}`).set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ field: 'to' }] });
  });
});
