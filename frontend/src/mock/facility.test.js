import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Kiểm tra dữ liệu giả của các API chưa có ở backend cư xử đúng API Contract: thiết bị, QR, lịch phòng,
// check-in, bàn giao, báo hỏng, bảo trì, quy tắc duyệt, báo cáo. Mỗi test nạp lại dữ liệu và cố định ngày 02/11/2026.
let call;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T08:00:00+07:00'));
  vi.resetModules();
  const { mockCall } = await import('./index');
  call = (method, path, body) => mockCall(method, path, body);
});
afterEach(() => vi.useRealTimers());
const fails = async (promise, status, code) => {
  const err = await promise.then(() => null, (e) => e);
  expect(err, `kỳ vọng lỗi ${code}`).not.toBeNull();
  expect([err.status, err.code]).toEqual([status, code]);
  return err;
};

// Phiếu đã duyệt xong cho phòng D.02.01 vào ngày `day` (mặc định 20 ngày sau), từ 08:00 đến 10:00.
async function approved(day = 20) {
  let start = dayjs().add(day, 'day').hour(8).minute(0).second(0);
  while (start.day() === 0 || start.day() === 6) start = start.add(1, 'day');
  const { request } = await call('POST', '/requests', { organizationId: 'org-1', roomId: 'room-d0201', purpose: 'Sinh hoạt', startAt: start.format(), endAt: start.add(2, 'hour').format(), participantCount: 40, equipment: [] });
  await call('POST', `/requests/${request.id}/submit`);
  await call('POST', `/requests/${request.id}/approve`, {});
  return (await call('POST', `/requests/${request.id}/approve`, {})).request;
}

describe('thiết bị và QR', () => {
  test('danh sách lọc theo phòng, loại, tình trạng; thêm trùng mã báo lỗi theo trường', async () => {
    const all = await call('GET', '/equipment?roomId=room-a1001');
    expect(all.total).toBe(5);
    expect((await call('GET', '/equipment?roomId=room-a1001&equipmentType=MICROPHONE')).items.map((e) => e.assetCode)).toEqual(['MIC-A1001-1', 'MIC-A1001-2']);
    const { equipment } = await call('POST', '/equipment', { assetCode: 'PJ-KHO-1', name: 'Máy chiếu dự phòng', equipmentType: 'PROJECTOR', status: 'GOOD' });
    expect(equipment).toMatchObject({ room: null, status: 'GOOD' });
    const err = await fails(call('POST', '/equipment', { assetCode: 'pj-kho-1', name: '', equipmentType: 'X', status: 'GOOD' }), 400, 'VALIDATION_ERROR');
    expect(err.details.map((d) => d.field).sort()).toEqual(['assetCode', 'equipmentType', 'name']);
  });

  test('đổi tình trạng sang Hỏng thì lọc Hỏng thấy thiết bị đó; ảnh QR trả về là ảnh', async () => {
    const [first] = (await call('GET', '/equipment?roomId=room-a1001')).items;
    await call('PATCH', `/equipment/${first.id}`, { ...first, roomId: first.room.id, status: 'BROKEN' });
    expect((await call('GET', '/equipment?status=BROKEN')).items.map((e) => e.id)).toEqual([first.id]);
    const blob = await call('GET', `/equipment/${first.id}/qr`);
    expect(blob.type).toBe('image/svg+xml');
    expect((await call('GET', '/rooms/room-a1001/qr')).type).toBe('image/svg+xml');
    expect(await call('GET', `/qr/${encodeURIComponent(first.qrToken)}`)).toMatchObject({ type: 'EQUIPMENT', equipment: { id: first.id } });
    await fails(call('GET', '/qr/khong-co'), 404, 'NOT_FOUND');
  });

  test('chi tiết phòng kèm danh sách thiết bị dùng cho ô chọn khi báo hỏng', async () => {
    const { room } = await call('GET', '/rooms/room-b0504');
    expect(room.equipmentItems.map((e) => e.equipmentType).sort()).toEqual(['AIR_CONDITIONER', 'AIR_CONDITIONER', 'PROJECTOR']);
  });
});

describe('lịch phòng, check-in, bàn giao', () => {
  test('lịch đã duyệt của phòng theo khoảng thời gian', async () => {
    const r = await approved();
    const week = dayjs(r.startAt).startOf('day');
    expect((await call('GET', `/rooms/room-d0201/bookings?from=${encodeURIComponent(week.format())}&to=${encodeURIComponent(week.add(1, 'day').format())}`)).items.map((b) => b.requestCode)).toEqual([r.code]);
    expect((await call('GET', `/rooms/room-d0201/bookings?from=${encodeURIComponent(week.add(1, 'day').format())}`)).items).toEqual([]);
  });

  test('check-in sai phòng hoặc sai giờ báo INVALID_STATE, đúng phòng đúng giờ thì thành công một lần', async () => {
    const r = await approved();
    await fails(call('POST', `/requests/${r.id}/checkin`, { qrToken: 'qr-room-A.10.01' }), 409, 'INVALID_STATE');
    await fails(call('POST', `/requests/${r.id}/checkin`, { qrToken: 'qr-room-D.02.01' }), 409, 'INVALID_STATE'); // chưa tới giờ
    vi.setSystemTime(dayjs(r.startAt).add(10, 'minute').toDate());
    const done = (await call('POST', `/requests/${r.id}/checkin`, { qrToken: 'qr-room-D.02.01' })).request;
    expect(done.checkin.result).toBe('SUCCESS');
    await fails(call('POST', `/requests/${r.id}/checkin`, { qrToken: 'qr-room-D.02.01' }), 409, 'INVALID_STATE');
  });

  test('bàn giao rồi nhận trả, làm lại báo INVALID_STATE; phiếu chưa duyệt không bàn giao được', async () => {
    const r = await approved();
    await fails(call('POST', `/requests/${r.id}/return`, {}), 409, 'INVALID_STATE');
    expect((await call('POST', `/requests/${r.id}/handover`, { conditionNote: 'Phòng sạch' })).request.handover).toMatchObject({ conditionNote: 'Phòng sạch', returnedAt: null });
    await fails(call('POST', `/requests/${r.id}/handover`, {}), 409, 'INVALID_STATE');
    expect((await call('POST', `/requests/${r.id}/return`, { conditionNote: 'Đủ thiết bị' })).request.handover.returnNote).toBe('Đủ thiết bị');
    const { request: draft } = await call('POST', '/requests', { organizationId: 'org-1', roomId: 'room-d0201', purpose: 'x', startAt: r.startAt, endAt: r.endAt, participantCount: 5, equipment: [] });
    await fails(call('POST', `/requests/${draft.id}/handover`, {}), 409, 'INVALID_STATE');
  });
});

describe('báo hỏng và bảo trì', () => {
  test('báo hỏng: thiết bị chuyển Hỏng; tạo phiếu bảo trì chuyển Đang bảo trì; hoàn tất thì Tốt lại', async () => {
    const r = await approved();
    const { room } = await call('GET', '/rooms/room-d0201');
    const eq = room.equipmentItems[0];
    const fd = new FormData();
    fd.append('requestId', r.id);
    fd.append('equipmentId', eq.id);
    fd.append('description', 'Máy chiếu không lên hình');
    const { incident } = await call('POST', '/incidents', fd);
    expect(incident).toMatchObject({ status: 'OPEN', room: { code: 'D.02.01' }, equipment: { id: eq.id } });
    expect((await call('GET', `/equipment/${eq.id}`)).equipment.status).toBe('BROKEN');
    const { ticket } = await call('POST', '/maintenance-tickets', { incidentId: incident.id, note: 'Thay bóng đèn' });
    expect((await call('GET', `/equipment/${eq.id}`)).equipment.status).toBe('MAINTENANCE');
    await fails(call('POST', '/maintenance-tickets', { incidentId: incident.id }), 409, 'INVALID_STATE');
    await call('PATCH', `/maintenance-tickets/${ticket.id}`, { status: 'DONE', note: 'Đã thay' });
    expect((await call('GET', `/equipment/${eq.id}`)).equipment.status).toBe('GOOD');
    expect((await call('GET', '/incidents?status=RESOLVED')).items[0]).toMatchObject({ id: incident.id, ticket: { status: 'DONE', note: 'Đã thay' } });
  });

  test('báo hỏng thiếu mô tả, thiết bị không thuộc phòng, ảnh sai định dạng đều bị từ chối', async () => {
    const r = await approved();
    const other = (await call('GET', '/equipment?roomId=room-a1001')).items[0];
    const form = (over) => {
      const fd = new FormData();
      Object.entries({ requestId: r.id, equipmentId: other.id, description: 'Hỏng', ...over }).forEach(([k, v]) => fd.append(k, v));
      return fd;
    };
    expect((await fails(call('POST', '/incidents', form({ description: ' ' })), 400, 'VALIDATION_ERROR')).details[0].field).toBe('description');
    expect((await fails(call('POST', '/incidents', form()), 400, 'VALIDATION_ERROR')).details[0].message).toMatch(/không thuộc phòng D\.02\.01/);
    await fails(call('POST', '/incidents', form({ image: new File(['x'], 'a.gif', { type: 'image/gif' }) })), 415, 'UNSUPPORTED_FILE_TYPE');
  });
});

describe('quy tắc duyệt và báo cáo', () => {
  test('quy tắc xếp theo ưu tiên; thêm cần ít nhất một điều kiện; tắt quy tắc giữ nguyên điều kiện', async () => {
    expect((await call('GET', '/approval-rules')).items.map((x) => x.priority)).toEqual([10, 20, 30]);
    const err = await fails(call('POST', '/approval-rules', { code: 'MOI', name: 'Mới', priority: 5, targetOrgId: 'o1', condition: {} }), 400, 'VALIDATION_ERROR');
    expect(err.details[0].field).toBe('condition');
    await fails(call('POST', '/approval-rules', { code: 'MOI', name: 'Mới', priority: 5, targetOrgId: 'o1', condition: { timeFrom: '18:00', timeTo: '07:00' } }), 400, 'VALIDATION_ERROR');
    const { rule } = await call('PATCH', '/approval-rules/rule-3', { active: false });
    expect(rule).toMatchObject({ active: false, condition: { minParticipants: 200 } });
  });

  test('báo cáo đếm yêu cầu theo trạng thái và giờ sử dụng phòng trong khoảng thời gian', async () => {
    const r = await approved();
    const from = encodeURIComponent(dayjs().format());
    const to = encodeURIComponent(dayjs().add(60, 'day').format());
    const d = await call('GET', `/reports/summary?from=${from}&to=${to}`);
    expect(d.requests).toMatchObject({ total: 1, byStatus: { APPROVED: 1 } });
    expect(d.roomUsage).toEqual([{ roomCode: 'D.02.01', roomName: r.room.name, bookings: 1, hours: 2 }]);
  });
});
