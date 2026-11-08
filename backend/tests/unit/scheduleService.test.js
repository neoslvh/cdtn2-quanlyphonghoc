// Test đơn vị tầng service thời khóa biểu: repo giả, tệp tạo ngay trong test, không HTTP, không cơ sở dữ liệu.
const ExcelJS = require('exceljs');
const { createScheduleService } = require('../../src/services/scheduleService');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { fakeDb, addRoom, login } = require('../helpers');
const { fromVN } = require('../../src/timeVN');
const { COLUMNS } = require('../../src/validators/schedule');

const HEAD = COLUMNS.join(',');
const csv = (rows, name = 'tkb.csv') => ({ originalname: name, size: 100, buffer: Buffer.from([HEAD, ...rows].join('\n'), 'utf8') });
const fails = async (promise) => promise.then(() => { throw new Error('kỳ vọng bị từ chối'); }, (e) => e);

function setup() {
  const repo = fakeDb();
  const room = addRoom(repo, { code: 'A.10.01' });
  const room2 = addRoom(repo, { code: 'A.10.02' });
  const service = createScheduleService({ repo, availability: createAvailabilityService(repo) });
  const { user } = login(repo, 'ADMIN');
  return { repo, service, room, room2, user };
}
const row = (over = []) => {
  const base = ['HK1 2026-2027', 'IT001', 'Lập trình Web', 'K29-SE01', '2', '1', '3', 'A.10.01', '02/11/2026', '23/11/2026'];
  over.forEach(([i, v]) => { base[i] = v; });
  return base.join(',');
};
const params = { semester: 'HK1 2026-2027', mode: 'REPLACE' };

describe('đọc và kiểm tra tệp (BR-12)', () => {
  test('tệp đúng: bản xem trước đổi tiết sang giờ và trải theo tuần', async () => {
    const { service, repo, user } = setup();
    const p = await service.createImport(user, csv([row()]), params);
    expect(p).toMatchObject({ status: 'PREVIEW', semester: 'HK1 2026-2027', mode: 'REPLACE', rowCount: 1, sessionCount: 4, conflicts: [] });
    // Thứ hai 02/11 đến 23/11 là bốn tuần, tiết 1 đến 3 là 07:00 đến 09:15 giờ Việt Nam.
    expect(repo.sessions.map((s) => s.startAt.toISOString())).toEqual([fromVN(2026, 11, 2, 7), fromVN(2026, 11, 9, 7), fromVN(2026, 11, 16, 7), fromVN(2026, 11, 23, 7)].map((d) => d.toISOString()));
    expect(repo.sessions[0].endAt.toISOString()).toBe(fromVN(2026, 11, 2, 9, 15).toISOString());
    expect(repo.sessions.every((s) => s.status === 'PENDING')).toBe(true);
  });

  test.each([
    ['học kỳ khác học kỳ đã chọn', [[0, 'HK2']], 'Học kỳ'],
    ['mã môn trống', [[1, '']], 'Mã môn'],
    ['thứ ngoài 2 đến 8', [[4, '9']], 'Thứ'],
    ['thứ không phải số', [[4, 'hai']], 'Thứ'],
    ['tiết bắt đầu không có trong khung tiết', [[5, '13']], 'Tiết bắt đầu'],
    ['tiết cuối vượt khung tiết', [[5, '11'], [6, '3']], 'Số tiết'],
    ['số tiết bằng 0', [[6, '0']], 'Số tiết'],
    ['mã phòng không tồn tại', [[7, 'Z.99.99']], 'Mã phòng'],
    ['ngày sai định dạng', [[8, '2026-11-02']], 'Từ ngày'],
    ['ngày không có thật (31/02)', [[9, '31/02/2026']], 'Đến ngày'],
    ['đến ngày trước từ ngày', [[9, '01/11/2026']], 'Đến ngày'],
    ['một dòng trải quá 370 ngày', [[9, '31/12/2028']], 'Đến ngày'],
  ])('%s thì IMPORT_INVALID đúng cột, không lưu gì', async (_name, over, column) => {
    const { service, repo, user } = setup();
    const err = await fails(service.createImport(user, csv([row(over)]), params));
    expect([err.status, err.code]).toEqual([422, 'IMPORT_INVALID']);
    expect(err.details).toEqual([{ row: 2, column, message: expect.any(String) }]);
    expect(repo.batches).toHaveLength(0);
    expect(repo.sessions).toHaveLength(0);
  });

  test('nhiều dòng sai báo từng dòng, dòng đúng cũng không được lưu', async () => {
    const { service, repo, user } = setup();
    const err = await fails(service.createImport(user, csv([row(), row([[4, '9']]), row([[7, 'Q.1']])]), params));
    expect(err.details.map((d) => [d.row, d.column])).toEqual([[3, 'Thứ'], [4, 'Mã phòng']]);
    expect(repo.sessions).toHaveLength(0);
  });

  test('dòng tiêu đề sai hoặc tệp rỗng thì lỗi ở dòng 1', async () => {
    const { service, user } = setup();
    const bad = await fails(service.createImport(user, { originalname: 'a.csv', size: 5, buffer: Buffer.from('a,b,c\n1,2,3') }, params));
    expect(bad.details[0]).toMatchObject({ row: 1 });
    const empty = await fails(service.createImport(user, csv([]), params));
    expect(empty.details[0]).toMatchObject({ row: 1, message: 'Tệp không có dòng dữ liệu nào.' });
  });

  test('hai lớp trong cùng tệp chồng giờ trên một phòng thì báo dòng đến sau, khác phòng hoặc liền kề thì không', async () => {
    const { service, user } = setup();
    const err = await fails(service.createImport(user, csv([row(), row([[3, 'K29-SE02'], [5, '3'], [6, '2']])]), params));
    expect(err.details).toEqual([{ row: 3, column: 'Mã phòng', message: expect.stringContaining('dòng 2') }]);
    await expect(service.createImport(user, csv([row(), row([[3, 'K29-SE02'], [5, '4'], [6, '2']]), row([[3, 'K29-SE03'], [7, 'A.10.02']])]), params)).resolves.toMatchObject({ rowCount: 3 });
  });

  test('CSV có ngoặc kép, dấu chấm phẩy và BOM đều đọc được', async () => {
    const { service, user } = setup();
    const semi = '﻿' + [COLUMNS.join(';'), 'HK1 2026-2027;IT001;"Lập trình; Web";K29-SE01;2;1;3;A.10.01;02/11/2026;02/11/2026'].join('\r\n');
    const p = await service.createImport(user, { originalname: 'a.csv', size: 50, buffer: Buffer.from(semi, 'utf8') }, params);
    expect(p.sessionCount).toBe(1);
  });

  test('Excel .xlsx: ô số và ô ngày đều đọc đúng', async () => {
    const { service, repo, user } = setup();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('TKB');
    ws.addRow(COLUMNS);
    ws.addRow(['HK1 2026-2027', 'IT001', 'Lập trình Web', 'K29-SE01', 2, 1, 3, 'A.10.01', new Date(Date.UTC(2026, 10, 2)), new Date(Date.UTC(2026, 10, 9))]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const p = await service.createImport(user, { originalname: 'tkb.xlsx', size: buffer.length, buffer }, params);
    expect(p).toMatchObject({ rowCount: 1, sessionCount: 2 });
    expect(repo.sessions[0].courseName).toBe('Lập trình Web');
  });

  test('tệp quá 5 MB, định dạng lạ, thiếu tệp, thiếu học kỳ, chế độ sai', async () => {
    const { service, user } = setup();
    expect((await fails(service.createImport(user, { ...csv([row()]), size: 5 * 1024 * 1024 + 1 }, params))).code).toBe('FILE_TOO_LARGE');
    expect((await fails(service.createImport(user, { originalname: 'a.pdf', size: 5, buffer: Buffer.from('x') }, params))).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await fails(service.createImport(user, undefined, params))).details[0].field).toBe('file');
    expect((await fails(service.createImport(user, csv([row()]), { semester: '', mode: 'XOA' }))).details.map((d) => d.field)).toEqual(['semester', 'mode']);
    const broken = await fails(service.createImport(user, { originalname: 'hong.xlsx', size: 5, buffer: Buffer.from('khong phai xlsx') }, params));
    expect(broken.code).toBe('IMPORT_INVALID');
  });
});

describe('xem trước, xác nhận và hủy (BR-11)', () => {
  // Một phiếu PENDING của phòng A.10.01 vào thứ hai 09/11/2026 08:00 đến 10:00, trùng buổi học tiết 1 đến 3.
  function withRequest(ctx) {
    const requester = login(ctx.repo, 'REQUESTER').user;
    const r = {
      id: '10000000-0000-4000-8000-000000000999', requestNo: 7, requesterId: requester.id, requesterName: requester.fullName, status: 'PENDING', roomId: ctx.room.id,
      room: { code: 'A.10.01' }, startAt: fromVN(2026, 11, 9, 8), endAt: fromVN(2026, 11, 9, 10), steps: [{ stepNo: 1, status: 'PENDING' }],
    };
    ctx.repo.requests.push(r);
    ctx.repo.bookings.push({ requestId: r.id, roomId: ctx.room.id, status: 'ACTIVE', startAt: r.startAt, endAt: r.endAt, requestNo: 7 });
    return r;
  }

  test('xem trước liệt kê yêu cầu PENDING bị trùng kèm lớp gây trùng', async () => {
    const ctx = setup();
    withRequest(ctx);
    const p = await ctx.service.createImport(ctx.user, csv([row()]), params);
    expect(p.conflicts).toEqual([{ requestId: expect.any(String), requestCode: 'REQ-007', requesterName: expect.any(String), roomCode: 'A.10.01', startAt: fromVN(2026, 11, 9, 8).toISOString(), endAt: fromVN(2026, 11, 9, 10).toISOString(), requestStatus: 'PENDING', conflictWith: { courseCode: 'IT001', classCode: 'K29-SE01' } }]);
    expect((await ctx.service.getImport(p.batchId)).conflicts).toHaveLength(1);
  });

  test('xác nhận: buổi học ACTIVE, yêu cầu trùng bị hủy kèm lý do ghi rõ lớp, bước duyệt và lượt đặt bị hủy theo', async () => {
    const ctx = setup();
    const r = withRequest(ctx);
    const p = await ctx.service.createImport(ctx.user, csv([row()]), params);
    const done = await ctx.service.commit(ctx.user, p.batchId);
    expect(done).toMatchObject({ status: 'COMMITTED', activatedSessions: 4, replacedSessions: 0 });
    expect(done.cancelledRequests).toEqual([{ id: r.id, requestCode: 'REQ-007', requesterName: expect.any(String), cancelReason: 'Phòng A.10.01 có lớp IT001 (K29-SE01) theo thời khóa biểu mới của Phòng Đào tạo.' }]);
    expect(r.status).toBe('CANCELLED');
    expect(r.steps[0].status).toBe('CANCELLED');
    expect(ctx.repo.bookings[0].status).toBe('CANCELLED');
    expect(ctx.repo.sessions.filter((s) => s.status === 'ACTIVE')).toHaveLength(4);
  });

  test('REPLACE thay buổi ACTIVE cũ của học kỳ, APPEND giữ nguyên buổi cũ', async () => {
    const ctx = setup();
    const first = await ctx.service.createImport(ctx.user, csv([row()]), params);
    await ctx.service.commit(ctx.user, first.batchId);
    const append = await ctx.service.createImport(ctx.user, csv([row([[7, 'A.10.02']])]), { ...params, mode: 'APPEND' });
    expect((await ctx.service.commit(ctx.user, append.batchId)).replacedSessions).toBe(0);
    const replace = await ctx.service.createImport(ctx.user, csv([row([[7, 'A.10.02'], [3, 'K-MOI']])]), params);
    const done = await ctx.service.commit(ctx.user, replace.batchId);
    expect(done.replacedSessions).toBe(8);
    expect(ctx.repo.sessions.filter((s) => s.status === 'ACTIVE').map((s) => s.classCode)).toEqual(['K-MOI', 'K-MOI', 'K-MOI', 'K-MOI']);
  });

  test('xác nhận hoặc hủy lần hai INVALID_STATE, hủy xem trước xóa buổi PENDING và phòng không bị chiếm', async () => {
    const ctx = setup();
    const p = await ctx.service.createImport(ctx.user, csv([row()]), params);
    await ctx.service.discard(ctx.user, p.batchId);
    expect(ctx.repo.sessions).toHaveLength(0);
    expect((await fails(ctx.service.discard(ctx.user, p.batchId))).code).toBe('INVALID_STATE');
    expect((await fails(ctx.service.commit(ctx.user, p.batchId))).code).toBe('INVALID_STATE');
    expect((await fails(ctx.service.getImport('khong-phai-uuid'))).code).toBe('NOT_FOUND');
  });

  test('lịch sử nhập mới nhất trước', async () => {
    const ctx = setup();
    await ctx.service.createImport(ctx.user, csv([row()], 'a.csv'), params);
    await ctx.service.createImport(ctx.user, csv([row()], 'b.csv'), params);
    const list = await ctx.service.listImports({ page: 1, pageSize: 10 });
    expect(list.items.map((b) => b.fileName)).toEqual(['b.csv', 'a.csv']);
  });
});

describe('tra cứu, sửa, hủy buổi học', () => {
  async function active(ctx) {
    const p = await ctx.service.createImport(ctx.user, csv([row()]), params);
    await ctx.service.commit(ctx.user, p.batchId);
    return ctx.repo.sessions.filter((s) => s.status === 'ACTIVE');
  }

  test('tra cứu theo phòng, khoảng ngày và trạng thái, đến ngày tính hết ngày đó', async () => {
    const ctx = setup();
    await active(ctx);
    const list = (q) => ctx.service.listSessions(q, { page: 1, pageSize: 10 });
    expect((await list({})).total).toBe(4);
    expect((await list({ roomCode: 'A.10.02' })).total).toBe(0);
    expect((await list({ from: '2026-11-09', to: '2026-11-09' })).total).toBe(1);
    expect((await list({ from: '2026-11-10' })).total).toBe(2);
    expect((await fails(list({ from: '09/11/2026' }))).details[0].field).toBe('from');
    expect((await fails(list({ status: 'LA' }))).details[0].field).toBe('status');
  });

  test('sửa giờ và phòng, không được trùng buổi khác hay lượt đặt đã duyệt, không tự trùng với chính nó', async () => {
    const ctx = setup();
    const [s1, s2] = await active(ctx);
    const moved = await ctx.service.updateSession(ctx.user, s1.id, { startAt: fromVN(2026, 11, 2, 7, 45).toISOString(), endAt: fromVN(2026, 11, 2, 9, 15).toISOString() });
    expect(moved.startAt).toBe(fromVN(2026, 11, 2, 7, 45).toISOString());
    ctx.repo.bookings.push({ requestId: 'x', roomId: ctx.room2.id, status: 'ACTIVE', startAt: s2.startAt, endAt: s2.endAt, requestNo: 3 });
    const err = await fails(ctx.service.updateSession(ctx.user, s2.id, { roomCode: 'A.10.02' }));
    expect([err.status, err.code, err.details]).toEqual([409, 'ROOM_CONFLICT', [{ source: 'ROOM_BOOKING', requestCode: 'REQ-003' }]]);
    expect((await fails(ctx.service.updateSession(ctx.user, s2.id, { roomCode: 'Z.9' }))).details[0].field).toBe('roomCode');
    expect((await fails(ctx.service.updateSession(ctx.user, s2.id, { endAt: fromVN(2026, 11, 9, 6).toISOString() }))).details[0].field).toBe('endAt');
    expect((await fails(ctx.service.updateSession(ctx.user, s2.id, {}))).code).toBe('VALIDATION_ERROR');
  });

  test('hủy buổi học, hủy lần hai và sửa buổi đã hủy đều INVALID_STATE, id lạ NOT_FOUND', async () => {
    const ctx = setup();
    const [s1] = await active(ctx);
    expect((await ctx.service.cancelSession(ctx.user, s1.id)).status).toBe('CANCELLED');
    expect((await fails(ctx.service.cancelSession(ctx.user, s1.id))).code).toBe('INVALID_STATE');
    expect((await fails(ctx.service.updateSession(ctx.user, s1.id, { roomCode: 'A.10.02' }))).code).toBe('INVALID_STATE');
    expect((await fails(ctx.service.cancelSession(ctx.user, 'abc'))).code).toBe('NOT_FOUND');
  });

  test('khung tiết trả đủ 12 tiết', async () => {
    const { items } = await setup().service.periodSlots();
    expect(items[0]).toEqual({ period: 1, startTime: '07:00', endTime: '07:45' });
    expect(items[6]).toEqual({ period: 7, startTime: '13:00', endTime: '13:45' });
    expect(items).toHaveLength(12);
  });
});
