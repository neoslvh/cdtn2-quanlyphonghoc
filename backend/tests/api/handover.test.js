const request = require('supertest');
const { createApp } = require('../../src/app');
const { fromVN } = require('../../src/timeVN');
const { fakeDb, login, addRoom, addEquipment, fakeStorage } = require('../helpers');

// SCRUM-22: bàn giao và nhận trả phòng, lưu danh sách thiết bị kèm tình trạng trước và sau sử dụng.
const CNTT = '00000000-0000-4000-9000-0000000000a1';

function setup() {
  const db = fakeDb();
  const room = addRoom(db, { code: 'A.10.01' });
  const pj = addEquipment(db, room, { assetCode: 'PJ-1', name: 'Máy chiếu 1' });
  addEquipment(db, room, { assetCode: 'AC-1', name: 'Máy lạnh 1', equipmentType: 'AIR_CONDITIONER' });
  const clock = { now: fromVN(2026, 11, 9, 7, 30) };
  const app = createApp({ db, storage: fakeStorage(), clock: () => clock.now });
  return { db, app, room, pj, clock, requester: login(db, 'REQUESTER'), other: login(db, 'REQUESTER'), staff: login(db, 'FACILITY_STAFF'), admin: login(db, 'ADMIN') };
}
// Phiếu 08:00 đến 10:00 ngày 9/11/2026, đặt trạng thái trực tiếp vì phần duyệt đã có test riêng.
async function created(ctx, status = 'APPROVED', who = ctx.requester) {
  const body = { organizationId: CNTT, roomId: ctx.room.id, purpose: 'Hội thảo', startAt: fromVN(2026, 11, 9, 8).toISOString(), endAt: fromVN(2026, 11, 9, 10).toISOString(), participantCount: 30 };
  const id = (await request(ctx.app).post('/api/requests').set(who.auth).send(body)).body.request.id;
  ctx.db.requests.find((r) => r.id === id).status = status;
  return id;
}
const post = (ctx, id, kind, body = {}, who = ctx.staff) => request(ctx.app).post(`/api/requests/${id}/${kind}`).set(who.auth).send(body);

describe('SCRUM-22: bàn giao và nhận trả', () => {
  test('nhân viên cơ sở vật chất xem được mọi phiếu đã duyệt; người đăng ký chỉ thấy phiếu của mình', async () => {
    const ctx = setup();
    const mine = await created(ctx);
    const theirs = await created(ctx, 'APPROVED', ctx.other);
    await created(ctx, 'PENDING');
    const staff = await request(ctx.app).get('/api/requests?status=APPROVED').set(ctx.staff.auth);
    expect([staff.status, staff.body.items.map((r) => r.id).sort()]).toEqual([200, [mine, theirs].sort()]);
    const own = await request(ctx.app).get('/api/requests?status=APPROVED').set(ctx.requester.auth);
    expect(own.body.items.map((r) => r.id)).toEqual([mine]);
  });

  test('bàn giao rồi nhận trả: lưu người, thời điểm, ghi chú và tình trạng thiết bị trước, sau; người đăng ký xem lại được biên bản', async () => {
    const ctx = setup();
    const id = await created(ctx);
    const h = await post(ctx, id, 'handover', { conditionNote: '  Phòng sạch, đủ bàn ghế  ' });
    expect(h.status).toBe(200);
    expect(h.body.request.handover).toEqual({
      handedOverAt: fromVN(2026, 11, 9, 7, 30).toISOString(),
      handedOverBy: 'Người FACILITY_STAFF',
      conditionNote: 'Phòng sạch, đủ bàn ghế',
      items: [
        { assetCode: 'PJ-1', name: 'Máy chiếu 1', equipmentType: 'PROJECTOR', status: 'GOOD' },
        { assetCode: 'AC-1', name: 'Máy lạnh 1', equipmentType: 'AIR_CONDITIONER', status: 'GOOD' },
      ],
      returnedAt: null,
      returnedBy: null,
      returnNote: null,
      returnItems: null,
    });
    // Trong lúc dùng phòng máy chiếu bị báo hỏng; biên bản nhận trả ghi tình trạng mới.
    ctx.pj.status = 'BROKEN';
    ctx.clock.now = fromVN(2026, 11, 9, 10, 15);
    const r = await post(ctx, id, 'return', { conditionNote: 'Máy chiếu không lên hình' }, ctx.admin);
    expect(r.body.request.handover).toMatchObject({ returnedAt: fromVN(2026, 11, 9, 10, 15).toISOString(), returnedBy: 'Người ADMIN', returnNote: 'Máy chiếu không lên hình' });
    expect(r.body.request.handover.items[0].status).toBe('GOOD');
    expect(r.body.request.handover.returnItems[0]).toEqual({ assetCode: 'PJ-1', name: 'Máy chiếu 1', equipmentType: 'PROJECTOR', status: 'BROKEN' });
    const seen = (await request(ctx.app).get(`/api/requests/${id}`).set(ctx.requester.auth)).body.request.handover;
    expect([seen.handedOverBy, seen.returnedBy]).toEqual(['Người FACILITY_STAFF', 'Người ADMIN']);
    expect(ctx.db.audit.filter((a) => a.entityId === id).map((a) => a.action)).toEqual(expect.arrayContaining(['REQUEST_HANDED_OVER', 'REQUEST_RETURNED']));
  });

  test('mỗi phiếu chỉ bàn giao và nhận trả một lần; nhận trả trước khi bàn giao bị chặn', async () => {
    const ctx = setup();
    const id = await created(ctx);
    const early = await post(ctx, id, 'return');
    expect([early.status, early.body.error.message]).toEqual([409, 'Yêu cầu chưa được bàn giao.']);
    expect((await post(ctx, id, 'handover')).status).toBe(200);
    const again = await post(ctx, id, 'handover');
    expect([again.status, again.body.error.message]).toEqual([409, 'Yêu cầu này đã được bàn giao.']);
    expect((await post(ctx, id, 'return')).status).toBe(200);
    const twice = await post(ctx, id, 'return');
    expect([twice.status, twice.body.error.message]).toEqual([409, 'Yêu cầu này đã nhận trả.']);
  });

  test('chỉ phiếu đã duyệt, chưa quá giờ kết thúc; ghi chú tối đa 1000 ký tự; ghi chú bỏ trống được', async () => {
    const ctx = setup();
    const pending = await created(ctx, 'PENDING');
    expect((await post(ctx, pending, 'handover')).body.error.message).toBe('Chỉ bàn giao yêu cầu đã duyệt.');
    const id = await created(ctx);
    const long = await post(ctx, id, 'handover', { conditionNote: 'x'.repeat(1001) });
    expect([long.status, long.body.error.details]).toEqual([400, [{ field: 'conditionNote', message: 'Ghi chú tình trạng tối đa 1000 ký tự.' }]]);
    ctx.clock.now = fromVN(2026, 11, 9, 10, 1);
    expect((await post(ctx, id, 'handover')).body.error.message).toBe('Đã quá giờ kết thúc sử dụng nên không bàn giao được.');
    ctx.clock.now = fromVN(2026, 11, 9, 9);
    const ok = await post(ctx, id, 'handover', { conditionNote: '   ' });
    expect([ok.status, ok.body.request.handover.conditionNote]).toEqual([200, null]);
  });

  test('người đăng ký và người không đăng nhập không bàn giao được; phiếu không có trả 404', async () => {
    const ctx = setup();
    const id = await created(ctx);
    expect((await post(ctx, id, 'handover', {}, ctx.requester)).status).toBe(403);
    expect((await request(ctx.app).post(`/api/requests/${id}/handover`)).status).toBe(401);
    expect((await post(ctx, '00000000-0000-4000-8000-000000009999', 'handover')).status).toBe(404);
    expect((await post(ctx, 'khong-co', 'return')).status).toBe(404);
  });
});
