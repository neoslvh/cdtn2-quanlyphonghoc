const request = require('supertest');
const { createApp } = require('../../src/app');
const { qrSvg, tokenOf } = require('../../src/qr');
const { fromVN } = require('../../src/timeVN');
const { fakeDb, login, addRoom, addEquipment, fakeStorage } = require('../helpers');

// SCRUM-10 mã QR, SCRUM-23 check-in, SCRUM-24 báo hỏng.
const CNTT = '00000000-0000-4000-9000-0000000000a1';
// supertest trả ảnh dưới dạng Buffer.
const svgOf = (res) => (Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.text);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function setup() {
  const db = fakeDb();
  const room = addRoom(db, { code: 'A.10.01' });
  const other = addRoom(db, { code: 'A.10.02' });
  const pj = addEquipment(db, room, { assetCode: 'PJ-A1001-1', name: 'Máy chiếu 1' });
  const otherEq = addEquipment(db, other, { assetCode: 'PJ-A1002-1' });
  const clock = { now: fromVN(2026, 11, 2, 8) };
  const storage = fakeStorage();
  const app = createApp({ db, storage, clock: () => clock.now });
  return { db, app, room, other, pj, otherEq, clock, storage, requester: login(db, 'REQUESTER'), stranger: login(db, 'REQUESTER'), staff: login(db, 'FACILITY_STAFF'), admin: login(db, 'ADMIN') };
}
// Phiếu đã duyệt 08:00 đến 10:00 ngày 9/11/2026 ở phòng A.10.01.
async function approved(ctx, status = 'APPROVED') {
  const body = { organizationId: CNTT, roomId: ctx.room.id, purpose: 'Thử', startAt: fromVN(2026, 11, 9, 8).toISOString(), endAt: fromVN(2026, 11, 9, 10).toISOString(), participantCount: 30 };
  const id = (await request(ctx.app).post('/api/requests').set(ctx.requester.auth).send(body)).body.request.id;
  ctx.db.requests.find((r) => r.id === id).status = status;
  return id;
}

describe('SCRUM-10: mã QR của phòng và thiết bị', () => {
  const KEYS = ['APP_URL', 'RENDER_EXTERNAL_URL', 'NODE_ENV'];
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test('nhân viên cơ sở vật chất tải được ảnh QR chứa đường dẫn /qr/{token}; người đăng ký bị chặn', async () => {
    const ctx = setup();
    process.env.APP_URL = 'https://qlphong.test/';
    const res = await request(ctx.app).get(`/api/rooms/${ctx.room.id}/qr`).set(ctx.staff.auth);
    expect([res.status, res.type]).toEqual([200, 'image/svg+xml']);
    expect(svgOf(res)).toBe(qrSvg('https://qlphong.test/qr/qr-room-1', 'A.10.01', 'qr-room-1'));
    const eq = await request(ctx.app).get(`/api/equipment/${ctx.pj.id}/qr`).set(ctx.admin.auth);
    expect(svgOf(eq)).toBe(qrSvg(`https://qlphong.test/qr/${ctx.pj.qrToken}`, 'PJ-A1001-1', ctx.pj.qrToken));
    expect((await request(ctx.app).get(`/api/rooms/${ctx.room.id}/qr`).set(ctx.requester.auth)).status).toBe(403);
    expect((await request(ctx.app).get('/api/equipment/khong-co/qr').set(ctx.staff.auth)).status).toBe(404);
  });

  test('không đặt APP_URL thì dùng địa chỉ đang mở, kể cả sau proxy HTTPS', async () => {
    const ctx = setup();
    const res = await request(ctx.app).get(`/api/rooms/${ctx.room.id}/qr`).set(ctx.staff.auth).set('Host', 'phong.vlu.test').set('X-Forwarded-Proto', 'https');
    expect(svgOf(res)).toBe(qrSvg('https://phong.vlu.test/qr/qr-room-1', 'A.10.01', 'qr-room-1'));
  });

  test('production không lấy địa chỉ từ header Host: dùng APP_URL hoặc RENDER_EXTERNAL_URL, thiếu cả hai thì báo lỗi cấu hình', async () => {
    const ctx = setup();
    process.env.NODE_ENV = 'production';
    delete process.env.APP_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    const bad = await request(ctx.app).get(`/api/rooms/${ctx.room.id}/qr`).set(ctx.staff.auth).set('Host', 'gia-mao.example');
    expect([bad.status, bad.body.error.code]).toEqual([500, 'CONFIG_ERROR']);
    process.env.RENDER_EXTERNAL_URL = 'https://qlphong.onrender.com';
    const ok = await request(ctx.app).get(`/api/rooms/${ctx.room.id}/qr`).set(ctx.staff.auth).set('Host', 'gia-mao.example');
    expect(svgOf(ok)).toBe(qrSvg('https://qlphong.onrender.com/qr/qr-room-1', 'A.10.01', 'qr-room-1'));
  });

  test('quét mã mở đúng tài nguyên và hiện đúng trạng thái hiện tại, kể cả khi ngừng hoạt động', async () => {
    const ctx = setup();
    ctx.room.status = 'MAINTENANCE';
    ctx.pj.status = 'BROKEN';
    const r = await request(ctx.app).get('/api/qr/qr-room-1').set(ctx.requester.auth);
    expect(r.body).toEqual({ type: 'ROOM', room: { id: ctx.room.id, code: 'A.10.01', name: 'Phòng 1', roomType: 'CLASSROOM', capacity: 80, status: 'MAINTENANCE' } });
    const e = await request(ctx.app).get(`/api/qr/${ctx.pj.qrToken}`).set(ctx.requester.auth);
    expect(e.body).toMatchObject({ type: 'EQUIPMENT', equipment: { assetCode: 'PJ-A1001-1', status: 'BROKEN', room: { code: 'A.10.01' } } });
    expect((await request(ctx.app).get('/api/qr/khong-co').set(ctx.requester.auth)).status).toBe(404);
    expect((await request(ctx.app).get('/api/qr/qr-room-1')).status).toBe(401);
  });

  test('tokenOf nhận cả đường dẫn quét được lẫn mã nhập tay', () => {
    expect(tokenOf('https://qlphong.test/qr/abc-123')).toBe('abc-123');
    expect(tokenOf('https://qlphong.test/qr/abc-123/?x=1')).toBe('abc-123');
    expect(tokenOf('  abc-123 ')).toBe('abc-123');
    expect(tokenOf(undefined)).toBe('');
  });
});

describe('SCRUM-23: check-in bằng QR tại phòng', () => {
  const checkin = (ctx, id, qrToken, who = ctx.requester) => request(ctx.app).post(`/api/requests/${id}/checkin`).set(who.auth).send({ qrToken });

  test('đúng phòng, trong khung giờ: check-in thành công một lần, có nhật ký', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    ctx.clock.now = fromVN(2026, 11, 9, 7, 45);
    const res = await checkin(ctx, id, 'https://qlphong.test/qr/qr-room-1');
    expect(res.status).toBe(200);
    expect(res.body.request.checkin).toEqual({ checkedInAt: fromVN(2026, 11, 9, 7, 45).toISOString(), result: 'SUCCESS' });
    expect((await request(ctx.app).get(`/api/requests/${id}`).set(ctx.requester.auth)).body.request.checkin.result).toBe('SUCCESS');
    const again = await checkin(ctx, id, 'qr-room-1');
    expect([again.status, again.body.error.message]).toEqual([409, 'Yêu cầu này đã check-in.']);
    expect(ctx.db.audit.filter((a) => a.action === 'REQUEST_CHECKED_IN')).toHaveLength(1);
  });

  test('sai phòng hoặc quét mã thiết bị bị từ chối', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    ctx.clock.now = fromVN(2026, 11, 9, 8, 30);
    for (const token of ['qr-room-2', ctx.pj.qrToken, 'khong-co']) {
      const res = await checkin(ctx, id, token);
      expect([res.status, res.body.error.code, res.body.error.message]).toEqual([409, 'INVALID_STATE', 'Mã QR không phải của phòng A.10.01.']);
    }
  });

  test('sai giờ bị từ chối: sớm hơn 15 phút trước giờ bắt đầu hoặc sau giờ kết thúc, tính đến từng giây', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    const sec = (d, n) => new Date(d.getTime() + n * 1000);
    for (const t of [sec(fromVN(2026, 11, 9, 7, 45), -1), fromVN(2026, 11, 9, 7, 44), sec(fromVN(2026, 11, 9, 10), 1), fromVN(2026, 11, 9, 10, 1)]) {
      ctx.clock.now = t;
      const res = await checkin(ctx, id, 'qr-room-1');
      expect([res.status, res.body.error.message]).toEqual([409, 'Chỉ check-in được từ 07:45 09/11/2026 đến 10:00 09/11/2026.']);
    }
    ctx.clock.now = fromVN(2026, 11, 9, 10);
    expect((await checkin(ctx, id, 'qr-room-1')).status).toBe(200);
  });

  test('đúng mốc 15 phút trước giờ bắt đầu thì check-in được', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    ctx.clock.now = fromVN(2026, 11, 9, 7, 45);
    expect((await checkin(ctx, id, 'qr-room-1')).status).toBe(200);
  });

  test('chỉ phiếu đã duyệt của chính mình; thiếu mã báo lỗi dưới ô nhập', async () => {
    const ctx = setup();
    ctx.clock.now = fromVN(2026, 11, 9, 8);
    const pending = await approved(ctx, 'PENDING');
    expect((await checkin(ctx, pending, 'qr-room-1')).body.error.message).toBe('Chỉ check-in được yêu cầu đã duyệt.');
    const id = await approved(ctx);
    expect((await checkin(ctx, id, 'qr-room-1', ctx.stranger)).status).toBe(404);
    expect((await checkin(ctx, id, 'qr-room-1', ctx.staff)).status).toBe(403);
    const empty = await checkin(ctx, id, '  ');
    expect([empty.status, empty.body.error.details]).toEqual([400, [{ field: 'qrToken', message: 'Quét hoặc nhập mã QR dán tại phòng.' }]]);
  });
});

describe('SCRUM-24: báo hỏng thiết bị', () => {
  const report = (ctx, fields, file, who = ctx.requester) => {
    const req = request(ctx.app).post('/api/incidents').set(who.auth);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return file ? req.attach('image', file.buffer, file.name) : req;
  };

  test('chi tiết phòng có danh sách thiết bị để chọn', async () => {
    const ctx = setup();
    const res = await request(ctx.app).get(`/api/rooms/${ctx.room.id}`).set(ctx.requester.auth);
    expect(res.body.room.equipmentItems).toEqual([{ id: ctx.pj.id, assetCode: 'PJ-A1001-1', name: 'Máy chiếu 1', equipmentType: 'PROJECTOR', status: 'GOOD', qrToken: ctx.pj.qrToken, room: { id: ctx.room.id, code: 'A.10.01' } }]);
  });

  test('gửi báo hỏng kèm ảnh: thiết bị chuyển BROKEN, liên kết người báo, phòng, thời điểm; nhân viên thấy trong danh sách', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    ctx.clock.now = fromVN(2026, 11, 9, 8, 30);
    const res = await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: '  Máy chiếu không lên hình  ' }, { buffer: PNG, name: 'anh.png' });
    expect(res.status).toBe(201);
    expect(res.body.incident).toMatchObject({ description: 'Máy chiếu không lên hình', imageName: 'anh.png', status: 'OPEN', reporterName: 'Người REQUESTER', room: { code: 'A.10.01' }, equipment: { id: ctx.pj.id, assetCode: 'PJ-A1001-1' }, ticket: null });
    expect(res.body.incident.request.id).toBe(id);
    expect(Number.isNaN(Date.parse(res.body.incident.createdAt))).toBe(false);
    expect(ctx.pj.status).toBe('BROKEN');
    expect(ctx.storage.saved).toEqual([{ size: PNG.length, ext: '.png' }]);
    expect(ctx.db.audit.find((a) => a.action === 'INCIDENT_REPORTED')).toMatchObject({ userId: ctx.requester.user.id });

    const list = await request(ctx.app).get('/api/incidents?status=OPEN').set(ctx.staff.auth);
    expect([list.body.total, list.body.items[0].id]).toEqual([1, res.body.incident.id]);
    expect((await request(ctx.app).get('/api/incidents?status=RESOLVED').set(ctx.staff.auth)).body.total).toBe(0);
    expect((await request(ctx.app).get('/api/incidents?status=SAI').set(ctx.staff.auth)).status).toBe(400);
    expect((await request(ctx.app).get('/api/incidents').set(ctx.requester.auth)).status).toBe(403);
  });

  test('ảnh là tùy chọn; mô tả bắt buộc; thiết bị phải thuộc phòng của phiếu', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    ctx.clock.now = fromVN(2026, 11, 9, 9);
    const noImg = await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Hỏng' });
    expect([noImg.status, noImg.body.incident.imageName]).toEqual([201, null]);
    const noDesc = await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: ' ' });
    expect([noDesc.status, noDesc.body.error.details]).toEqual([400, [{ field: 'description', message: 'Mô tả tình trạng hỏng.' }]]);
    const wrongRoom = await report(ctx, { requestId: id, equipmentId: ctx.otherEq.id, description: 'Hỏng' });
    expect([wrongRoom.status, wrongRoom.body.error.details]).toEqual([400, [{ field: 'equipmentId', message: 'Thiết bị không thuộc phòng A.10.01.' }]]);
    expect(ctx.otherEq.status).toBe('GOOD');
  });

  test('ảnh không phải PNG hoặc JPG thật bị từ chối và không lưu tệp', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    ctx.clock.now = fromVN(2026, 11, 9, 9);
    for (const file of [{ buffer: Buffer.from('GIF89a'), name: 'anh.gif' }, { buffer: Buffer.from('MZ fake'), name: 'anh.png' }]) {
      const res = await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Hỏng' }, file);
      expect([res.status, res.body.error.code]).toEqual([415, 'UNSUPPORTED_FILE_TYPE']);
    }
    expect(ctx.storage.saved).toHaveLength(0);
    expect(ctx.pj.status).toBe('GOOD');
  });

  test('chỉ báo hỏng trong phiếu đã duyệt của chính mình', async () => {
    const ctx = setup();
    ctx.clock.now = fromVN(2026, 11, 9, 9);
    const pending = await approved(ctx, 'PENDING');
    expect((await report(ctx, { requestId: pending, equipmentId: ctx.pj.id, description: 'Hỏng' })).status).toBe(409);
    const id = await approved(ctx);
    expect((await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Hỏng' }, null, ctx.stranger)).status).toBe(404);
    expect((await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Hỏng' }, null, ctx.staff)).status).toBe(403);
  });

  test('chỉ báo hỏng trong thời gian dùng phòng', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    for (const t of [fromVN(2026, 11, 9, 7, 44), fromVN(2026, 11, 9, 10, 1)]) {
      ctx.clock.now = t;
      const res = await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Hỏng' });
      expect([res.status, res.body.error.message]).toEqual([409, 'Chỉ báo hỏng được trong thời gian sử dụng phòng, từ 07:45 09/11/2026 đến 10:00 09/11/2026.']);
    }
    expect(ctx.pj.status).toBe('GOOD');
  });

  test('thiết bị đã báo hỏng hoặc đang bảo trì thì không báo lại, giữ nguyên trạng thái', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    ctx.clock.now = fromVN(2026, 11, 9, 9);
    expect((await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Hỏng' })).status).toBe(201);
    const again = await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Vẫn hỏng' }, { buffer: PNG, name: 'a.png' });
    expect([again.status, again.body.error.message]).toEqual([409, 'Thiết bị PJ-A1001-1 đã được báo hỏng và đang chờ xử lý.']);
    expect(ctx.storage.saved).toHaveLength(0);
    ctx.pj.status = 'MAINTENANCE';
    const mt = await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Hỏng' });
    expect([mt.status, mt.body.error.message, ctx.pj.status]).toEqual([409, 'Thiết bị PJ-A1001-1 đang bảo trì.', 'MAINTENANCE']);
    expect(ctx.db.incidents).toHaveLength(1);
  });

  test('thiết bị bị người khác báo hỏng giữa lúc kiểm tra và lúc ghi: trả 409 và xóa ảnh vừa lưu', async () => {
    const ctx = setup();
    const id = await approved(ctx);
    ctx.clock.now = fromVN(2026, 11, 9, 9);
    // Lúc kiểm tra thiết bị còn Tốt, nhưng trước khi ghi đã có báo hỏng khác chuyển sang BROKEN.
    const find = ctx.db.findEquipment;
    ctx.db.findEquipment = async (eid) => {
      const e = await find(eid);
      ctx.pj.status = 'BROKEN';
      return { ...e, status: 'GOOD' };
    };
    const res = await report(ctx, { requestId: id, equipmentId: ctx.pj.id, description: 'Hỏng' }, { buffer: PNG, name: 'anh.png' });
    expect([res.status, res.body.error.message]).toEqual([409, 'Thiết bị PJ-A1001-1 đã được báo hỏng và đang chờ xử lý.']);
    expect(ctx.storage.saved).toHaveLength(1);
    expect(ctx.storage.removed).toEqual(['file-1.png']);
    expect(ctx.db.incidents).toHaveLength(0);
  });
});
