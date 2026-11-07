const { Router } = require('express');
const { ApiError } = require('./errors');
const { isUuid, paginate, validation } = require('./http');

const ROOM_TYPES = ['CLASSROOM', 'LAB', 'HALL'];
const ROOM_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'];

// Đối tượng trả về cho giao diện: tòa nhà và cơ sở lấy từ bảng building, equipment là số thiết bị tốt theo loại.
const toRoom = (r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  building: r.buildingName,
  campus: r.campus,
  roomType: r.roomType,
  capacity: r.capacity,
  status: r.status,
  equipment: r.equipment || {},
});

// Mã tòa là phần đầu của mã phòng, ví dụ A.10.01 thuộc tòa A.
const buildingCode = (roomCode) => roomCode.split('.')[0].toUpperCase();

// Kiểm tra nội dung thêm hoặc sửa phòng, báo từng trường lỗi như giao diện cần (FR-03).
function checkRoom(b) {
  const details = [];
  const code = typeof b.code === 'string' ? b.code.trim() : '';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const campus = typeof b.campus === 'string' ? b.campus.trim() : '';
  if (!code) details.push({ field: 'code', message: 'Nhập mã phòng.' });
  else if (code.length > 20) details.push({ field: 'code', message: 'Mã phòng tối đa 20 ký tự.' });
  if (!name) details.push({ field: 'name', message: 'Nhập tên phòng.' });
  else if (name.length > 100) details.push({ field: 'name', message: 'Tên phòng tối đa 100 ký tự.' });
  if (!campus) details.push({ field: 'campus', message: 'Chọn cơ sở.' });
  else if (campus.length > 120) details.push({ field: 'campus', message: 'Tên cơ sở tối đa 120 ký tự.' });
  if (!ROOM_TYPES.includes(b.roomType)) details.push({ field: 'roomType', message: 'Chọn loại phòng.' });
  if (!Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > 2000) details.push({ field: 'capacity', message: 'Sức chứa là số nguyên từ 1 đến 2000.' });
  if (!ROOM_STATUSES.includes(b.status)) details.push({ field: 'status', message: 'Chọn trạng thái.' });
  if (details.length) throw validation(details);
  return { code, name, campus, roomType: b.roomType, capacity: b.capacity, status: b.status };
}

function roomRoutes({ db, guards }) {
  const router = Router();
  const { requireAuth, requireRole } = guards;
  const manage = requireRole('FACILITY_STAFF', 'ADMIN');

  // Danh sách phòng, lọc theo cơ sở, loại, trạng thái, từ khóa. Không truyền page thì trả toàn bộ để dùng cho ô chọn phòng.
  router.get('/rooms', requireAuth, async (req, res) => {
    const { campus, roomType, status, q } = req.query;
    if (roomType && !ROOM_TYPES.includes(roomType)) throw validation([{ field: 'roomType', message: 'Loại phòng không hợp lệ.' }]);
    if (status && !ROOM_STATUSES.includes(status)) throw validation([{ field: 'status', message: 'Trạng thái không hợp lệ.' }]);
    const items = (await db.listRooms({ campus, roomType, status, q: typeof q === 'string' ? q.trim() : '' })).map(toRoom);
    res.json(req.query.page ? paginate(items, req.query) : { items, page: 1, pageSize: items.length, total: items.length });
  });

  router.get('/rooms/:id', requireAuth, async (req, res) => {
    const room = isUuid(req.params.id) ? await db.findRoom(req.params.id) : null;
    if (!room) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy phòng.');
    res.json({ room: toRoom(room) });
  });

  // Thêm phòng: mã tòa suy ra từ mã phòng, tòa chưa có thì tạo, tòa đã có phải khớp cơ sở.
  router.post('/rooms', requireAuth, manage, async (req, res) => {
    const data = checkRoom(req.body || {});
    if (await db.findRoomByCode(data.code)) throw validation([{ field: 'code', message: 'Mã phòng đã tồn tại.' }]);
    const bCode = buildingCode(data.code);
    let building = await db.findBuildingByCode(bCode);
    if (building && building.campus && building.campus !== data.campus) {
      throw validation([{ field: 'campus', message: `Tòa ${building.code} thuộc ${building.campus}.` }]);
    }
    building = building || (await db.createBuilding({ code: bCode, name: `Tòa ${bCode}`, campus: data.campus }));
    const { campus, ...rest } = data;
    const room = await db.createRoom({ ...rest, buildingId: building.id });
    res.status(201).json({ room: toRoom(room) });
  });

  // Sửa phòng: không cho đổi mã phòng đã có vì mã gắn với lịch sử sử dụng.
  router.patch('/rooms/:id', requireAuth, manage, async (req, res) => {
    const current = isUuid(req.params.id) ? await db.findRoom(req.params.id) : null;
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy phòng.');
    const body = req.body || {};
    if (body.code !== undefined && String(body.code).trim() !== current.code) throw validation([{ field: 'code', message: 'Không đổi mã phòng đã có.' }]);
    const data = checkRoom({ ...body, code: current.code });
    if (data.campus !== current.campus) throw validation([{ field: 'campus', message: 'Không đổi cơ sở của phòng. Tòa nhà thuộc cơ sở này.' }]);
    const { campus, code, ...rest } = data;
    const room = await db.updateRoom(current.id, rest);
    res.json({ room: toRoom(room) });
  });

  return router;
}

module.exports = { roomRoutes, ROOM_TYPES, ROOM_STATUSES, toRoom };
