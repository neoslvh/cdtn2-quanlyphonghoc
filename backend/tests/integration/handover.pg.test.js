// Test tích hợp trên PostgreSQL thật cho bàn giao và nhận trả (SCRUM-22). Chỉ chạy khi RUN_PG_TESTS=1.
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { createFacilityService } = require('../../src/services/facilityService');
const { createRequestService } = require('../../src/services/requestService');
const { fromVN } = require('../../src/timeVN');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;

maybe('bàn giao và nhận trả trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const db = createDb(prisma);
  const clock = { now: fromVN(2034, 3, 1, 7, 30) };
  const requests = createRequestService({ repo: db, availability: createAvailabilityService(db), storage: { save: async () => 'x' } });
  const facility = createFacilityService({ repo: db, storage: {}, clock: () => clock.now });
  const tag = `HV-${Date.now().toString(36).toUpperCase()}`;
  let requester;
  let staff;
  let room;

  beforeAll(async () => {
    requester = await prisma.user.findUnique({ where: { email: 'sv01@qlphong.local' }, include: { organization: true } });
    staff = await prisma.user.findUnique({ where: { email: 'csvc@qlphong.local' } });
    room = await prisma.room.findUnique({ where: { code: 'D.02.01' } });
  });
  afterAll(async () => {
    const ids = (await prisma.usageRequest.findMany({ where: { purpose: tag }, select: { id: true } })).map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.usageRequest.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function approved() {
    const r = await requests.create(requester, { organizationId: requester.organization.id, roomId: room.id, purpose: tag, startAt: fromVN(2034, 3, 1, 8).toISOString(), endAt: fromVN(2034, 3, 1, 10).toISOString(), participantCount: 20 });
    await prisma.usageRequest.update({ where: { id: r.id }, data: { status: 'APPROVED' } });
    return r.id;
  }

  test('hai lần bàn giao cùng lúc chỉ một thành công; biên bản lưu đủ danh sách thiết bị của phòng', async () => {
    const id = await approved();
    const res = await Promise.allSettled([facility.handover(staff, id, { conditionNote: 'Lần A' }), facility.handover(staff, id, { conditionNote: 'Lần B' })]);
    expect(res.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(res.find((x) => x.status === 'rejected').reason.code).toBe('INVALID_STATE');
    const row = await prisma.usageHandover.findUnique({ where: { requestId: id } });
    const equipment = await prisma.equipment.findMany({ where: { roomId: room.id }, orderBy: { assetCode: 'asc' } });
    expect(row).toMatchObject({ handedOverBy: staff.id, returnedAt: null, returnedBy: null });
    expect(row.handoverItems).toEqual(equipment.map((e) => ({ assetCode: e.assetCode, name: e.name, equipmentType: e.equipmentType, status: e.status })));
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'REQUEST_HANDED_OVER' } })).toBe(1);
  });

  test('hai lần nhận trả cùng lúc chỉ một thành công; chi tiết phiếu có biên bản đầy đủ', async () => {
    const id = await approved();
    await facility.handover(staff, id, {});
    clock.now = fromVN(2034, 3, 1, 10, 5);
    const res = await Promise.allSettled([facility.returnRoom(staff, id, { conditionNote: 'Ổn' }), facility.returnRoom(staff, id, { conditionNote: 'Ổn' })]);
    expect(res.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    const detail = await requests.get(requester, id);
    expect(detail.handover).toMatchObject({ handedOverBy: staff.fullName, returnedBy: staff.fullName, returnNote: 'Ổn', returnedAt: fromVN(2034, 3, 1, 10, 5).toISOString() });
    expect(detail.handover.returnItems.length).toBe(detail.handover.items.length);
    clock.now = fromVN(2034, 3, 1, 7, 30);
  });

  test('CHECK của bảng: thời điểm nhận trả và người nhận trả đi cùng nhau, không trước giờ bàn giao', async () => {
    const id = await approved();
    await facility.handover(staff, id, {});
    await expect(prisma.usageHandover.update({ where: { requestId: id }, data: { returnedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.usageHandover.update({ where: { requestId: id }, data: { returnedAt: fromVN(2034, 3, 1, 7), returnedBy: staff.id } })).rejects.toThrow();
  });
});
