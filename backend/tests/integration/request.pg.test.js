// Test tích hợp trên PostgreSQL thật cho phiếu đề xuất. Chỉ chạy khi RUN_PG_TESTS=1.
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { createRequestService } = require('../../src/services/requestService');
const { addWorkdays, fromVN, parts } = require('../../src/timeVN');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;

maybe('phiếu đề xuất trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const db = createDb(prisma);
  const saved = [];
  const storage = { save: async (_b, ext) => { saved.push(ext); return `x${saved.length}${ext}`; } };
  const service = createRequestService({ repo: db, availability: createAvailabilityService(db), storage });
  const tag = `P${Date.now().toString(36).toUpperCase()}`;
  let user;
  let org;
  let room;

  // Một ngày làm việc cách hiện tại hơn 10 ngày làm việc, mỗi test dùng một giờ khác nhau để không chồng nhau.
  const slot = (h) => {
    const p = parts(addWorkdays(new Date(), 10));
    return { startAt: fromVN(p.y, p.m, p.d, h).toISOString(), endAt: fromVN(p.y, p.m, p.d, h + 1).toISOString() };
  };
  const body = (h, over = {}) => ({ organizationId: org.id, roomId: room.id, purpose: tag, ...slot(h), participantCount: 30, equipment: [{ itemType: 'MICROPHONE', quantity: 2 }], ...over });

  beforeAll(async () => {
    user = await prisma.user.findUnique({ where: { email: 'sv01@qlphong.local' }, include: { organization: true } });
    org = user.organization;
    room = await prisma.room.findUnique({ where: { code: 'C.03.02' } });
  });
  afterAll(async () => {
    await prisma.usageRequest.deleteMany({ where: { purpose: tag } });
    await prisma.$disconnect();
  });

  test('tạo nháp, đọc lại đủ thông tin, sửa thay toàn bộ thiết bị', async () => {
    const r = await service.create(user, body(7));
    expect(r).toMatchObject({ status: 'DRAFT', organizationName: org.name, room: { code: 'C.03.02' }, equipment: [{ itemType: 'MICROPHONE', quantity: 2, otherDescription: null }] });
    expect(r.code).toMatch(/^REQ-\d{3,}$/);
    const edited = await service.update(user, r.id, body(7, { equipment: [{ itemType: 'PROJECTOR' }, { itemType: 'OTHER', otherDescription: 'Bảng di động' }] }));
    expect(edited.equipment.map((e) => e.itemType).sort()).toEqual(['OTHER', 'PROJECTOR']);
    expect((await service.get(user, r.id)).equipment).toHaveLength(2);
  });

  test('gửi tạo hai bước duyệt trong cùng giao dịch, bước đầu PENDING', async () => {
    const r = await service.create(user, body(8));
    const sent = await service.submit(user, r.id);
    expect(sent.status).toBe('PENDING');
    expect(sent.steps).toEqual([
      { order: 1, organizationName: 'Phòng Đào tạo', status: 'PENDING' },
      { order: 2, organizationName: 'Phòng Quản trị cơ sở vật chất', status: 'WAITING' },
    ]);
  });

  test('năm yêu cầu cùng gửi một phiếu: đúng một thành công, còn lại INVALID_STATE, chỉ có đúng hai bước duyệt', async () => {
    const r = await service.create(user, body(9));
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.submit(user, r.id)));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((x) => x.status === 'rejected').every((x) => x.reason.code === 'INVALID_STATE')).toBe(true);
    expect(await prisma.approvalStep.count({ where: { requestId: r.id } })).toBe(2);
  });

  test('hủy phiếu đang chờ: phiếu và các bước chưa xử lý cùng thành CANCELLED', async () => {
    const r = await service.create(user, body(10));
    await service.submit(user, r.id);
    const c = await service.cancel(user, r.id, 'Đổi kế hoạch');
    expect(c.status).toBe('CANCELLED');
    expect(c.steps.map((s) => s.status)).toEqual(['CANCELLED', 'CANCELLED']);
  });

  test('đính kèm lưu bản ghi, danh sách của tôi phân trang trong cơ sở dữ liệu', async () => {
    const r = await service.create(user, body(11));
    const withFile = await service.attach(user, r.id, { originalname: 'KeHoach.pdf', size: 3, buffer: Buffer.from('abc') });
    expect(withFile.attachments.map((a) => a.fileName)).toEqual(['KeHoach.pdf']);
    const page = await service.list(user, {}, { page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThanOrEqual(5);
  });

  test('CHECK của cơ sở dữ liệu từ chối thiết bị khác không mô tả và số lượng không dương dù lớp trên bị bỏ qua', async () => {
    const r = await service.create(user, body(12));
    await expect(prisma.requestEquipment.create({ data: { requestId: r.id, itemType: 'OTHER', quantity: 1 } })).rejects.toThrow();
    await expect(prisma.requestEquipment.create({ data: { requestId: r.id, itemType: 'AUDIO', quantity: 0 } })).rejects.toThrow();
  });
});
