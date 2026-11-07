const request = require('supertest');
const { createApp } = require('../../src/app');
const { fakeDb, login } = require('../helpers');

const room = { code: 'A.10.01', name: 'Phòng A.10.01', campus: 'Cơ sở 1', roomType: 'CLASSROOM', capacity: 80, status: 'AVAILABLE' };

function setup() {
  const db = fakeDb();
  const app = createApp({ db });
  return { db, app, staff: login(db, 'FACILITY_STAFF', '00000000-0000-4000-9000-0000000000a4').auth, requester: login(db, 'REQUESTER').auth, admin: login(db, 'ADMIN', '00000000-0000-4000-9000-0000000000a4').auth };
}

describe('phân quyền API phòng (PB-02, NFR-04)', () => {
  test('chưa đăng nhập thì 401', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/rooms')).status).toBe(401);
  });

  test('người đăng ký xem được nhưng không thêm, sửa được phòng', async () => {
    const { app, requester } = setup();
    expect((await request(app).get('/api/rooms').set(requester)).status).toBe(200);
    const post = await request(app).post('/api/rooms').set(requester).send(room);
    expect([post.status, post.body.error.code]).toEqual([403, 'FORBIDDEN']);
    expect((await request(app).patch('/api/rooms/x').set(requester).send(room)).status).toBe(403);
  });

  test('nhân viên cơ sở vật chất và quản trị viên được thêm phòng', async () => {
    const { app, staff, admin } = setup();
    expect((await request(app).post('/api/rooms').set(staff).send(room)).status).toBe(201);
    expect((await request(app).post('/api/rooms').set(admin).send({ ...room, code: 'A.10.02' })).status).toBe(201);
  });
});

describe('thêm phòng', () => {
  test('tạo phòng, trả đủ thông tin kèm tòa và cơ sở', async () => {
    const { app, staff } = setup();
    const res = await request(app).post('/api/rooms').set(staff).send(room);
    expect(res.body.room).toMatchObject({ code: 'A.10.01', building: 'Tòa A', campus: 'Cơ sở 1', capacity: 80, status: 'AVAILABLE', equipment: {} });
  });

  test('mã tòa chưa có thì tự tạo tòa mới theo cơ sở của phòng', async () => {
    const { app, staff, db } = setup();
    const res = await request(app).post('/api/rooms').set(staff).send({ ...room, code: 'e.01.01', campus: 'Cơ sở 3' });
    expect(res.status).toBe(201);
    expect(db.buildings.find((b) => b.code === 'E')).toMatchObject({ name: 'Tòa E', campus: 'Cơ sở 3' });
  });

  test('mã phòng trùng, cơ sở không khớp tòa đã có thì báo lỗi đúng trường', async () => {
    const { app, staff } = setup();
    await request(app).post('/api/rooms').set(staff).send(room);
    const dup = await request(app).post('/api/rooms').set(staff).send(room);
    expect(dup.body.error.details).toEqual([{ field: 'code', message: 'Mã phòng đã tồn tại.' }]);
    const wrong = await request(app).post('/api/rooms').set(staff).send({ ...room, code: 'A.10.09', campus: 'Cơ sở 2' });
    expect(wrong.body.error.details[0]).toMatchObject({ field: 'campus', message: 'Tòa A thuộc Cơ sở 1.' });
  });

  test('dữ liệu sai báo từng trường', async () => {
    const { app, staff } = setup();
    const res = await request(app).post('/api/rooms').set(staff).send({ code: 'X'.repeat(21), name: '', campus: '', roomType: 'VILLA', capacity: 0, status: 'OK' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['campus', 'capacity', 'code', 'name', 'roomType', 'status']);
  });
});

describe('danh sách và chi tiết', () => {
  async function seed(app, staff) {
    const mk = (over) => request(app).post('/api/rooms').set(staff).send({ ...room, ...over });
    await mk({});
    await mk({ code: 'A.10.02', name: 'Hội trường A.10.02', roomType: 'HALL', capacity: 250 });
    await mk({ code: 'C.01.01', name: 'Phòng C.01.01', campus: 'Cơ sở 2', status: 'MAINTENANCE' });
  }

  test('không truyền page thì trả toàn bộ, truyền page thì phân trang', async () => {
    const { app, staff, requester } = setup();
    await seed(app, staff);
    const all = await request(app).get('/api/rooms').set(requester);
    expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 3 });
    const paged = await request(app).get('/api/rooms?page=2&pageSize=2').set(requester);
    expect(paged.body.items.map((r) => r.code)).toEqual(['C.01.01']);
    expect(paged.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
  });

  test('lọc theo cơ sở, loại, trạng thái và từ khóa', async () => {
    const { app, staff, requester } = setup();
    await seed(app, staff);
    const codes = async (qs) => (await request(app).get(`/api/rooms?${qs}`).set(requester)).body.items.map((r) => r.code);
    expect(await codes('campus=' + encodeURIComponent('Cơ sở 2'))).toEqual(['C.01.01']);
    expect(await codes('roomType=HALL')).toEqual(['A.10.02']);
    expect(await codes('status=MAINTENANCE')).toEqual(['C.01.01']);
    expect(await codes('q=' + encodeURIComponent('hội trường'))).toEqual(['A.10.02']);
    expect((await request(app).get('/api/rooms?roomType=VILLA').set(requester)).status).toBe(400);
  });

  test('lọc theo tòa nhà và sức chứa tối thiểu, tham số sai trả 400', async () => {
    const { app, staff, requester } = setup();
    await seed(app, staff);
    await request(app).post('/api/rooms').set(staff).send({ ...room, code: 'B.01.01', name: 'Phòng B.01.01', capacity: 30 });
    const codes = async (qs) => (await request(app).get(`/api/rooms?${qs}`).set(requester)).body.items.map((r) => r.code);
    expect(await codes('building=a')).toEqual(['A.10.01', 'A.10.02']);
    expect(await codes('building=B')).toEqual(['B.01.01']);
    expect(await codes('minCapacity=100')).toEqual(['A.10.02']);
    expect(await codes('building=A&minCapacity=100')).toEqual(['A.10.02']);
    expect((await request(app).get('/api/rooms?minCapacity=abc').set(requester)).body.error.details[0].field).toBe('minCapacity');
    expect((await request(app).get('/api/rooms?building=A&building=B').set(requester)).body.error.details[0].field).toBe('building');
    expect((await request(app).get('/api/rooms?campus=a&campus=b').set(requester)).body.error.details[0].field).toBe('campus');
  });

  test('chi tiết phòng, id không tồn tại hoặc sai định dạng thì 404', async () => {
    const { app, staff, requester } = setup();
    const created = (await request(app).post('/api/rooms').set(staff).send(room)).body.room;
    expect((await request(app).get(`/api/rooms/${created.id}`).set(requester)).body.room.code).toBe('A.10.01');
    expect((await request(app).get('/api/rooms/khong-phai-uuid').set(requester)).status).toBe(404);
    expect((await request(app).get('/api/rooms/00000000-0000-4000-8000-999999999999').set(requester)).status).toBe(404);
  });
});

describe('sửa phòng', () => {
  test('đổi tên, sức chứa, trạng thái nhưng không đổi mã hay cơ sở', async () => {
    const { app, staff } = setup();
    const created = (await request(app).post('/api/rooms').set(staff).send(room)).body.room;
    const ok = await request(app).patch(`/api/rooms/${created.id}`).set(staff).send({ ...room, name: 'Tên mới', capacity: 60, status: 'MAINTENANCE' });
    expect(ok.body.room).toMatchObject({ code: 'A.10.01', name: 'Tên mới', capacity: 60, status: 'MAINTENANCE' });
    const code = await request(app).patch(`/api/rooms/${created.id}`).set(staff).send({ ...room, code: 'A.99.99' });
    expect(code.body.error.details[0]).toMatchObject({ field: 'code', message: 'Không đổi mã phòng đã có.' });
    const campus = await request(app).patch(`/api/rooms/${created.id}`).set(staff).send({ ...room, campus: 'Cơ sở 2' });
    expect(campus.body.error.details[0].field).toBe('campus');
  });

  test('sửa phòng không tồn tại báo 404', async () => {
    const { app, staff } = setup();
    expect((await request(app).patch('/api/rooms/khong-co').set(staff).send(room)).status).toBe(404);
  });
});
