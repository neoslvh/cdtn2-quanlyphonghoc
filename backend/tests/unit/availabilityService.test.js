// Test đơn vị tầng service tra cứu phòng trống và phát hiện trùng lịch, repo giả trong bộ nhớ.
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { fakeDb, addRoom } = require('../helpers');
const { fromVN } = require('../../src/timeVN');

// Thứ ba 10/11/2026 theo giờ Việt Nam.
const at = (h, mi = 0) => fromVN(2026, 11, 10, h, mi);
const query = (over = {}) => ({ from: at(8).toISOString(), to: at(10).toISOString(), capacity: '40', ...over });
const fails = async (promise) => promise.then(() => { throw new Error('kỳ vọng bị từ chối'); }, (e) => e);

function setup() {
  const repo = fakeDb();
  return { repo, service: createAvailabilityService(repo) };
}
const session = (room, from, to, over = {}) => ({ roomId: room.id, courseCode: 'IT001', classCode: 'K29-SE01', status: 'ACTIVE', startAt: from, endAt: to, ...over });

describe('tra cứu phòng trống (BR-01, BR-08, BR-10)', () => {
  test('phòng AVAILABLE đủ sức chứa và không bị chiếm thì trống', async () => {
    const { repo, service } = setup();
    const free = addRoom(repo, { capacity: 80 });
    addRoom(repo, { capacity: 30 });
    addRoom(repo, { status: 'MAINTENANCE' });
    const res = await service.findAvailable(query());
    expect(res.items.map((r) => r.code)).toEqual([free.code]);
    expect(res.total).toBe(1);
  });

  test('buổi học ACTIVE giao một phần với khung giờ thì phòng không trống', async () => {
    const { repo, service } = setup();
    const busy = addRoom(repo);
    const other = addRoom(repo);
    repo.sessions.push(session(busy, at(9), at(11)));
    expect((await service.findAvailable(query())).items.map((r) => r.code)).toEqual([other.code]);
  });

  test('hai khoảng chỉ chạm đầu mút (kết thúc 08:00, bắt đầu 08:00) thì không tính là trùng', async () => {
    const { repo, service } = setup();
    const room = addRoom(repo);
    repo.sessions.push(session(room, at(6), at(8)), session(room, at(10), at(12)));
    expect((await service.findAvailable(query())).items).toHaveLength(1);
  });

  test('buổi học PENDING hoặc CANCELLED không chặn phòng, lượt đặt ACTIVE thì chặn', async () => {
    const { repo, service } = setup();
    const a = addRoom(repo);
    const b = addRoom(repo);
    repo.sessions.push(session(a, at(8), at(10), { status: 'PENDING' }), session(a, at(8), at(10), { status: 'CANCELLED' }));
    repo.bookings.push({ roomId: b.id, status: 'ACTIVE', startAt: at(8), endAt: at(9), requestNo: 7 });
    expect((await service.findAvailable(query())).items.map((r) => r.code)).toEqual([a.code]);
  });

  test('lọc theo thiết bị phải đủ số lượng tình trạng tốt', async () => {
    const { repo, service } = setup();
    const rich = addRoom(repo, { equipment: { MICROPHONE: 2, PROJECTOR: 1 } });
    addRoom(repo, { equipment: { MICROPHONE: 1, PROJECTOR: 1 } });
    const res = await service.findAvailable(query({ equipment: 'MICROPHONE:2,PROJECTOR:1' }));
    expect(res.items.map((r) => r.code)).toEqual([rich.code]);
  });

  test('phân trang theo page và pageSize, total là số phòng thỏa điều kiện', async () => {
    const { repo, service } = setup();
    for (let i = 0; i < 5; i++) addRoom(repo);
    const res = await service.findAvailable(query({ page: '2', pageSize: '2' }));
    expect(res).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(res.items).toHaveLength(2);
  });
});

describe('kiểm tra tham số', () => {
  test.each([
    ['thiếu khung giờ và số người', {}, ['capacity', 'from', 'to']],
    ['kết thúc trước bắt đầu', { to: at(7).toISOString() }, ['to']],
    ['khác ngày', { to: fromVN(2026, 11, 11, 9).toISOString() }, ['to']],
    ['kết thúc sau 21:30', { from: at(20).toISOString(), to: at(22).toISOString() }, ['to']],
    ['số người bằng 0', { capacity: '0' }, ['capacity']],
    ['loại phòng lạ', { roomType: 'VILLA' }, ['roomType']],
    ['cơ sở là mảng', { campus: ['Cơ sở 1', 'Cơ sở 2'] }, ['campus']],
    ['cơ sở là object', { campus: { contains: 'x' } }, ['campus']],
    ['giờ bắt đầu không có múi giờ', { from: '2026-11-10T08:00:00' }, ['from']],
    ['giờ kết thúc dạng ngày giờ có khoảng trắng', { to: '2026-11-10 10:00' }, ['to']],
    ['thiết bị sai dạng', { equipment: 'MICROPHONE:abc' }, ['equipment']],
  ])('%s thì VALIDATION_ERROR', async (_name, over, fields) => {
    const { service } = setup();
    const base = _name.startsWith('thiếu') ? {} : query();
    const err = await fails(service.findAvailable({ ...base, ...over }));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details.map((d) => d.field).sort()).toEqual(fields);
  });

  test('kết thúc đúng 21:30 được chấp nhận', async () => {
    const { service } = setup();
    await expect(service.findAvailable(query({ from: at(20).toISOString(), to: at(21, 30).toISOString() }))).resolves.toMatchObject({ total: 0 });
  });
});

describe('conflictDetails (dùng khi gửi yêu cầu, FR-08)', () => {
  test('trùng buổi học báo CLASS_SCHEDULE kèm môn và lớp, trùng lượt đặt báo mã yêu cầu', async () => {
    const { repo, service } = setup();
    const room = addRoom(repo);
    expect(await service.conflictDetails(room.id, at(8), at(10))).toEqual([]);
    repo.sessions.push(session(room, at(9), at(11)));
    expect(await service.conflictDetails(room.id, at(8), at(10))).toEqual([{ source: 'CLASS_SCHEDULE', courseCode: 'IT001', classCode: 'K29-SE01' }]);
    repo.sessions.length = 0;
    repo.bookings.push({ roomId: room.id, status: 'ACTIVE', startAt: at(8), endAt: at(10), requestNo: 12 });
    expect(await service.conflictDetails(room.id, at(9), at(10))).toEqual([{ source: 'ROOM_BOOKING', requestCode: 'REQ-012' }]);
  });
});
