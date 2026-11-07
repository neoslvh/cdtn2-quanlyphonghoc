// Test đơn vị tầng service phiếu đề xuất: repo giả, đồng hồ cố định, không HTTP, không cơ sở dữ liệu.
const { createRequestService } = require('../../src/services/requestService');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { fakeDb, addRoom, fakeStorage, login } = require('../helpers');
const { fromVN } = require('../../src/timeVN');

// Hiện tại: thứ hai 02/11/2026 08:00 giờ Việt Nam. Đủ 3 ngày làm việc nghĩa là bắt đầu từ thứ năm 05/11 08:00.
const NOW = fromVN(2026, 11, 2, 8);
const day = (d, h, mi = 0) => fromVN(2026, 11, d, h, mi).toISOString();
const fails = async (promise) => promise.then(() => { throw new Error('kỳ vọng bị từ chối'); }, (e) => e);

function setup() {
  const repo = fakeDb();
  const storage = fakeStorage();
  const service = createRequestService({ repo, availability: createAvailabilityService(repo), storage, clock: () => NOW });
  const room = addRoom(repo, { capacity: 80 });
  const { user } = login(repo, 'REQUESTER');
  const body = (over = {}) => ({ organizationId: '00000000-0000-4000-9000-0000000000a1', roomId: room.id, purpose: 'Sinh hoạt chuyên đề', startAt: day(12, 8), endAt: day(12, 10), participantCount: 40, equipment: [], ...over });
  return { repo, service, storage, room, user, body };
}

describe('tạo và sửa phiếu nháp', () => {
  test('tạo nháp trả mã REQ-001 và đủ thông tin, chưa có bước duyệt', async () => {
    const { service, user, body, room } = setup();
    const r = await service.create(user, body({ equipment: [{ itemType: 'MICROPHONE', quantity: 2 }] }));
    expect(r).toMatchObject({ code: 'REQ-001', status: 'DRAFT', participantCount: 40, room: { code: room.code }, steps: [], equipment: [{ itemType: 'MICROPHONE', quantity: 2 }] });
  });

  test('phòng hoặc đơn vị không tồn tại, đơn vị không phải đơn vị đăng ký thì báo đúng trường', async () => {
    const { service, user, body } = setup();
    expect((await fails(service.create(user, body({ roomId: '00000000-0000-4000-8000-000000000000' })))).details[0].field).toBe('roomId');
    expect((await fails(service.create(user, body({ organizationId: '00000000-0000-4000-9000-0000000000a2' })))).details[0].field).toBe('organizationId');
  });

  test('dữ liệu sai báo từng trường, thiết bị khác thiếu mô tả báo đúng dòng', async () => {
    const { service, user, body } = setup();
    const err = await fails(service.create(user, { purpose: '', participantCount: 0, equipment: [{ itemType: 'OTHER' }, { itemType: 'OTHER', otherDescription: 'x' }] }));
    const fields = err.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['organizationId', 'roomId', 'purpose', 'startAt', 'participantCount', 'equipment.0.otherDescription', 'equipment.1.itemType']));
    const noZone = await fails(service.create(user, body({ startAt: '2026-11-12T08:00:00' })));
    expect(noZone.details[0].field).toBe('startAt');
  });

  test('chỉ sửa được phiếu nháp của chính mình', async () => {
    const { service, user, body, repo } = setup();
    const r = await service.create(user, body());
    const edited = await service.update(user, r.id, body({ purpose: 'Đã sửa', participantCount: 50 }));
    expect(edited).toMatchObject({ purpose: 'Đã sửa', participantCount: 50 });
    const stranger = login(repo, 'REQUESTER').user;
    expect((await fails(service.update(stranger, r.id, body()))).code).toBe('NOT_FOUND');
    await service.submit(user, r.id);
    expect((await fails(service.update(user, r.id, body()))).code).toBe('INVALID_STATE');
  });

  test('phiếu vừa được gửi giữa hai bước: repo báo không còn nháp thì sửa bị từ chối', async () => {
    const { service, user, body, repo } = setup();
    const r = await service.create(user, body());
    repo.updateRequest = async () => null;
    expect((await fails(service.update(user, r.id, body()))).code).toBe('INVALID_STATE');
  });
});

describe('gửi phiếu, thứ tự kiểm tra theo bảng 1.7', () => {
  const submitWith = async (over, extra = () => {}) => {
    const ctx = setup();
    extra(ctx);
    const r = await ctx.service.create(ctx.user, ctx.body(over));
    return { ...ctx, id: r.id, result: ctx.service.submit(ctx.user, r.id) };
  };

  test('hợp lệ: chuyển PENDING, sinh bước duyệt, bước đầu PENDING, các bước sau WAITING', async () => {
    const { result } = await submitWith({});
    const r = await result;
    expect(r.status).toBe('PENDING');
    expect(r.submittedAt).toBe(NOW.toISOString());
    expect(r.steps).toEqual([
      { order: 1, organizationName: 'Phòng Đào tạo', status: 'PENDING' },
      { order: 2, organizationName: 'Phòng Quản trị cơ sở vật chất', status: 'WAITING' },
    ]);
  });

  test('BR-02 gửi sát giờ: 04/11 vi phạm, đúng 05/11 (ba ngày làm việc sau) thì được', async () => {
    const bad = await fails((await submitWith({ startAt: day(4, 8), endAt: day(4, 10) })).result);
    expect([bad.status, bad.code]).toEqual([422, 'LEAD_TIME_VIOLATION']);
    await expect((await submitWith({ startAt: day(5, 8), endAt: day(5, 10) })).result).resolves.toMatchObject({ status: 'PENDING' });
  });

  test('ngày làm việc bỏ qua thứ bảy và chủ nhật: gửi thứ sáu 06/11 cho thứ tư 11/11 thì vi phạm', async () => {
    const ctx = setup();
    const service = createRequestService({ repo: ctx.repo, availability: createAvailabilityService(ctx.repo), storage: ctx.storage, clock: () => fromVN(2026, 11, 6, 8) });
    const r = await service.create(ctx.user, ctx.body({ startAt: day(10, 8), endAt: day(10, 10) }));
    expect((await fails(service.submit(ctx.user, r.id))).code).toBe('LEAD_TIME_VIOLATION');
    const ok = await service.create(ctx.user, ctx.body({ startAt: day(11, 8), endAt: day(11, 10) }));
    await expect(service.submit(ctx.user, ok.id)).resolves.toMatchObject({ status: 'PENDING' });
  });

  test('BR-09 kết thúc sau 21:30: 21:31 vi phạm, đúng 21:30 thì được', async () => {
    expect((await fails((await submitWith({ startAt: day(12, 20), endAt: day(12, 21, 31) })).result)).code).toBe('AFTER_HOURS_LIMIT');
    await expect((await submitWith({ startAt: day(12, 20), endAt: day(12, 21, 30) })).result).resolves.toMatchObject({ status: 'PENDING' });
  });

  test('phòng chuyển sang bảo trì sau khi lưu nháp thì gửi báo ROOM_UNAVAILABLE', async () => {
    const { service, user, body, room, repo } = setup();
    const r = await service.create(user, body());
    room.status = 'MAINTENANCE';
    repo.requests[0].room.status = 'MAINTENANCE';
    const err = await fails(service.submit(user, r.id));
    expect([err.status, err.code]).toEqual([409, 'ROOM_UNAVAILABLE']);
  });

  test('vượt sức chứa thì CAPACITY_EXCEEDED, từ 200 người không có văn bản thì ATTACHMENT_REQUIRED, có tệp thì được kèm Ban Giám hiệu', async () => {
    expect((await fails((await submitWith({ participantCount: 81 })).result)).code).toBe('CAPACITY_EXCEEDED');
    const big = setup();
    big.room.capacity = 300;
    const r = await big.service.create(big.user, big.body({ participantCount: 220 }));
    expect((await fails(big.service.submit(big.user, r.id))).code).toBe('ATTACHMENT_REQUIRED');
    await big.service.attach(big.user, r.id, { originalname: 'VanBanBGH.pdf', size: 1000, buffer: Buffer.from('%PDF-1.4 x') });
    const sent = await big.service.submit(big.user, r.id);
    expect(sent.steps.map((s) => s.organizationName)).toEqual(['Phòng Đào tạo', 'Ban Giám hiệu', 'Phòng Quản trị cơ sở vật chất']);
  });

  test('BR-10 trùng buổi học chính khóa thì ROOM_CONFLICT kèm môn và lớp', async () => {
    const { result } = await submitWith({ startAt: day(12, 8), endAt: day(12, 10) }, ({ repo, room }) =>
      repo.sessions.push({ roomId: room.id, status: 'ACTIVE', startAt: new Date(day(12, 9)), endAt: new Date(day(12, 11)), courseCode: 'IT001', classCode: 'K29-SE01' }),
    );
    const err = await fails(result);
    expect([err.status, err.code]).toEqual([409, 'ROOM_CONFLICT']);
    expect(err.details).toEqual([{ source: 'CLASS_SCHEDULE', courseCode: 'IT001', classCode: 'K29-SE01' }]);
  });

  test('BR-01 trùng lượt đặt đã duyệt thì ROOM_CONFLICT kèm mã yêu cầu; PENDING của người khác không chặn', async () => {
    const approved = await submitWith({}, ({ repo, room }) => repo.bookings.push({ roomId: room.id, status: 'ACTIVE', startAt: new Date(day(12, 7)), endAt: new Date(day(12, 9)), requestNo: 5 }));
    const err = await fails(approved.result);
    expect(err.details).toEqual([{ source: 'ROOM_BOOKING', requestCode: 'REQ-005' }]);
    const ctx = setup();
    const a = await ctx.service.create(ctx.user, ctx.body());
    await ctx.service.submit(ctx.user, a.id);
    const other = login(ctx.repo, 'REQUESTER').user;
    const b = await ctx.service.create(other, ctx.body());
    await expect(ctx.service.submit(other, b.id)).resolves.toMatchObject({ status: 'PENDING' });
  });

  test('thứ tự kiểm tra: phiếu vừa sát giờ vừa vượt sức chứa thì báo LEAD_TIME_VIOLATION trước', async () => {
    const { result } = await submitWith({ startAt: day(3, 8), endAt: day(3, 10), participantCount: 81 });
    expect((await fails(result)).code).toBe('LEAD_TIME_VIOLATION');
  });

  test('gửi hai lần thì lần hai INVALID_STATE; lỗi nghiệp vụ giữ nguyên phiếu ở nháp', async () => {
    const { service, user, body } = setup();
    const r = await service.create(user, body());
    await service.submit(user, r.id);
    expect((await fails(service.submit(user, r.id))).code).toBe('INVALID_STATE');
    const bad = await service.create(user, body({ startAt: day(3, 8), endAt: day(3, 10) }));
    await fails(service.submit(user, bad.id));
    expect((await service.get(user, bad.id)).status).toBe('DRAFT');
  });

  test('hai yêu cầu gửi cùng lúc: repo báo phiếu không còn là nháp thì lần sau INVALID_STATE', async () => {
    const { service, user, body, repo } = setup();
    const r = await service.create(user, body());
    repo.submitRequest = async () => null;
    expect((await fails(service.submit(user, r.id))).code).toBe('INVALID_STATE');
  });
});

describe('đính kèm tệp', () => {
  test('nhận PDF, từ chối quá 5 MB và định dạng lạ, ghi tên gốc nhưng lưu bằng tên ngẫu nhiên', async () => {
    const { service, user, body, storage } = setup();
    const r = await service.create(user, body());
    const ok = await service.attach(user, r.id, { originalname: '../../etc/KeHoach.PDF', size: 10, buffer: Buffer.from('%PDF-1.4 x') });
    expect(ok.attachments).toEqual([{ id: expect.any(String), fileName: 'KeHoach.PDF' }]);
    expect(storage.saved).toEqual([{ size: 10, ext: '.pdf' }]);
    const big = await fails(service.attach(user, r.id, { originalname: 'a.pdf', size: 5 * 1024 * 1024 + 1, buffer: Buffer.alloc(1) }));
    expect([big.status, big.code]).toEqual([413, 'FILE_TOO_LARGE']);
    const exe = await fails(service.attach(user, r.id, { originalname: 'virus.exe', size: 10, buffer: Buffer.alloc(1) }));
    expect([exe.status, exe.code]).toEqual([415, 'UNSUPPORTED_FILE_TYPE']);
    expect((await fails(service.attach(user, r.id, undefined))).details[0].field).toBe('file');
  });

  test('tệp đổi đuôi (nội dung không đúng chữ ký) bị từ chối, mỗi phiếu tối đa 5 tệp', async () => {
    const { service, user, body } = setup();
    const r = await service.create(user, body());
    const fake = await fails(service.attach(user, r.id, { originalname: 'virus.pdf', size: 10, buffer: Buffer.from('MZ  chương trình') }));
    expect([fake.status, fake.code]).toEqual([415, 'UNSUPPORTED_FILE_TYPE']);
    const png = { originalname: 'a.png', size: 8, buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]) };
    for (let i = 0; i < 5; i++) await service.attach(user, r.id, png);
    expect((await fails(service.attach(user, r.id, png))).details[0].message).toContain('tối đa 5');
  });

  test('lưu bản ghi lỗi thì tệp vừa ghi bị xóa, không mồ côi trên đĩa', async () => {
    const { service, user, body, repo, storage } = setup();
    const r = await service.create(user, body());
    repo.addAttachment = async () => { throw new Error('mất kết nối'); };
    await fails(service.attach(user, r.id, { originalname: 'a.pdf', size: 8, buffer: Buffer.from('%PDF-1.4') }));
    expect(storage.removed).toEqual(['file-1.pdf']);
  });
});

describe('xem, danh sách và hủy', () => {
  test('người đăng ký chỉ thấy phiếu của mình, ADMIN và FACILITY_STAFF xem được mọi phiếu', async () => {
    const { service, user, body, repo } = setup();
    const r = await service.create(user, body());
    const stranger = login(repo, 'REQUESTER').user;
    expect((await fails(service.get(stranger, r.id))).code).toBe('NOT_FOUND');
    expect((await service.get({ ...stranger, role: 'ADMIN' }, r.id)).id).toBe(r.id);
    expect((await service.get({ ...stranger, role: 'FACILITY_STAFF' }, r.id)).id).toBe(r.id);
    expect((await service.list(stranger, {}, { page: 1, pageSize: 10 })).total).toBe(0);
    expect((await service.list({ ...stranger, role: 'ADMIN' }, {}, { page: 1, pageSize: 10 })).total).toBe(1);
  });

  test('hủy phiếu nháp hoặc đang chờ, các bước chưa xử lý bị hủy theo; hủy lần hai INVALID_STATE', async () => {
    const { service, user, body } = setup();
    const r = await service.create(user, body());
    await service.submit(user, r.id);
    const cancelled = await service.cancel(user, r.id, 'Đổi lịch');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Đổi lịch' });
    expect(cancelled.steps.every((s) => s.status === 'CANCELLED')).toBe(true);
    expect((await fails(service.cancel(user, r.id))).code).toBe('INVALID_STATE');
  });
});
