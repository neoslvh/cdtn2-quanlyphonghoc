// Test tích hợp trên PostgreSQL thật cho mã QR (SCRUM-10), check-in (SCRUM-23), báo hỏng (SCRUM-24). Chỉ chạy khi RUN_PG_TESTS=1.
const { PrismaClient } = require('@prisma/client');
const { createDb } = require('../../src/repositories');
const { createAvailabilityService } = require('../../src/services/availabilityService');
const { createFacilityService } = require('../../src/services/facilityService');
const { createRequestService } = require('../../src/services/requestService');
const { createRoomService } = require('../../src/services/roomService');
const { fromVN } = require('../../src/timeVN');

const maybe = process.env.RUN_PG_TESTS === '1' ? describe : describe.skip;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

maybe('mã QR, check-in, báo hỏng trên PostgreSQL thật', () => {
  const prisma = new PrismaClient();
  const db = createDb(prisma);
  const clock = { now: fromVN(2033, 3, 1, 8) };
  const saved = [];
  const storage = { save: async () => { saved.push(1); return `img-${saved.length}.png`; }, remove: async () => {} };
  const requests = createRequestService({ repo: db, availability: createAvailabilityService(db), storage });
  const facility = createFacilityService({ repo: db, storage, clock: () => clock.now });
  const tag = `FAC-${Date.now().toString(36).toUpperCase()}`;
  let requester;
  let room;
  let other;
  let eq;
  let eqStatus;

  beforeAll(async () => {
    requester = await prisma.user.findUnique({ where: { email: 'sv01@qlphong.local' }, include: { organization: true } });
    room = await prisma.room.findUnique({ where: { code: 'D.02.01' } });
    other = await prisma.room.findUnique({ where: { code: 'A.10.01' } });
    eq = await prisma.equipment.findFirst({ where: { roomId: room.id, equipmentType: 'PROJECTOR' } });
    eqStatus = eq.status;
    await prisma.equipment.update({ where: { id: eq.id }, data: { status: 'GOOD' } });
  });
  afterAll(async () => {
    const ids = (await prisma.usageRequest.findMany({ where: { purpose: tag }, select: { id: true } })).map((r) => r.id);
    const incidents = (await prisma.incidentReport.findMany({ where: { requestId: { in: ids } }, select: { id: true } })).map((i) => i.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...incidents] } } });
    await prisma.usageRequest.deleteMany({ where: { id: { in: ids } } });
    await prisma.equipment.update({ where: { id: eq.id }, data: { status: eqStatus } });
    await prisma.$disconnect();
  });

  // Phiếu đã duyệt 08:00 đến 10:00 ngày 1/3/2033. Bỏ qua chuỗi duyệt vì phần duyệt đã có test riêng.
  async function approved() {
    const r = await requests.create(requester, { organizationId: requester.organization.id, roomId: room.id, purpose: tag, startAt: fromVN(2033, 3, 1, 8).toISOString(), endAt: fromVN(2033, 3, 1, 10).toISOString(), participantCount: 20 });
    await prisma.usageRequest.update({ where: { id: r.id }, data: { status: 'APPROVED' } });
    return r.id;
  }

  test('SCRUM-10 mã QR phòng và thiết bị trỏ đúng tài nguyên; chi tiết phòng có danh sách thiết bị', async () => {
    expect(await facility.resolveQr(`https://x.test/qr/${room.qrToken}`)).toMatchObject({ type: 'ROOM', room: { id: room.id, code: 'D.02.01', status: room.status } });
    expect(await facility.resolveQr(eq.qrToken)).toMatchObject({ type: 'EQUIPMENT', equipment: { id: eq.id, assetCode: eq.assetCode, room: { id: room.id, code: 'D.02.01' } } });
    expect(await facility.roomQr(room.id, 'https://x.test')).toContain('>D.02.01</text>');
    const detail = await createRoomService(db).get(room.id);
    expect(detail.equipmentItems.map((e) => e.id)).toContain(eq.id);
    expect(detail.equipmentItems.every((e) => e.room.id === room.id)).toBe(true);
  });

  test('SCRUM-23 check-in: sai phòng bị chặn, đúng phòng ghi một lần; hai lần check-in cùng lúc chỉ một thành công', async () => {
    const id = await approved();
    await expect(facility.checkin(requester, id, { qrToken: other.qrToken })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const results = await Promise.allSettled([facility.checkin(requester, id, { qrToken: room.qrToken }), facility.checkin(requester, id, { qrToken: room.qrToken })]);
    expect(results.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((x) => x.status === 'rejected').reason.code).toBe('INVALID_STATE');
    const row = await prisma.checkin.findUnique({ where: { requestId: id } });
    expect(row).toMatchObject({ userId: requester.id, roomId: room.id, result: 'SUCCESS' });
    expect((await requests.get(requester, id)).checkin).toEqual({ checkedInAt: fromVN(2033, 3, 1, 8).toISOString(), result: 'SUCCESS' });
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'REQUEST_CHECKED_IN' } })).toBe(1);
  });

  test('SCRUM-24 báo hỏng: lưu người báo, phòng, thời điểm; thiết bị chuyển BROKEN; nhân viên lọc được theo trạng thái', async () => {
    const id = await approved();
    const i = await facility.reportIncident(requester, { requestId: id, equipmentId: eq.id, description: 'Máy chiếu không lên hình' }, { originalname: 'loi.png', buffer: PNG });
    expect(i).toMatchObject({ status: 'OPEN', imageName: 'loi.png', reporterName: requester.fullName, room: { code: 'D.02.01' }, equipment: { id: eq.id } });
    const row = await prisma.incidentReport.findUnique({ where: { id: i.id } });
    expect(row).toMatchObject({ requestId: id, reportedBy: requester.id, imagePath: `img-${saved.length}.png` });
    expect((await prisma.equipment.findUnique({ where: { id: eq.id } })).status).toBe('BROKEN');
    const open = await facility.listIncidents({ status: 'OPEN' }, { page: 1, pageSize: 100 });
    expect(open.items.map((x) => x.id)).toContain(i.id);
    expect((await facility.listIncidents({ status: 'RESOLVED' }, { page: 1, pageSize: 100 })).items.map((x) => x.id)).not.toContain(i.id);
    expect(await prisma.auditLog.count({ where: { entityId: i.id, action: 'INCIDENT_REPORTED' } })).toBe(1);
  });

  test('SCRUM-24 hai báo hỏng cùng lúc cho một thiết bị: đúng một báo hỏng được tạo, lần kia INVALID_STATE', async () => {
    await prisma.equipment.update({ where: { id: eq.id }, data: { status: 'GOOD' } });
    const id = await approved();
    const send = () => facility.reportIncident(requester, { requestId: id, equipmentId: eq.id, description: 'Cùng lúc' }, null);
    const res = await Promise.allSettled([send(), send()]);
    expect(res.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(res.find((x) => x.status === 'rejected').reason.code).toBe('INVALID_STATE');
    expect(await prisma.incidentReport.count({ where: { requestId: id } })).toBe(1);
  });
});
