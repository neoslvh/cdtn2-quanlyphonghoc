const { ApiError, isUniqueViolation } = require('../errors');
const { isUuid, validation } = require('../http');
const { checkRoom, checkRoomFilter } = require('../validators/room');

// Tầng service: toàn bộ quy tắc nghiệp vụ về phòng. Không biết gì về HTTP hay SQL, nhận repo qua constructor
// nên kiểm thử được bằng repo giả, không cần cơ sở dữ liệu.

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

const dupCode = () => validation([{ field: 'code', message: 'Mã phòng đã tồn tại.' }]);
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Không tìm thấy phòng.');

function createRoomService(repo) {
  return {
    /**
     * Danh sách phòng, lọc theo cơ sở, loại, trạng thái, từ khóa.
     * Nhận: filters { campus, roomType, status, q }, paging { page, pageSize } hoặc null để lấy toàn bộ.
     * Trả: { items, total }.
     * Lỗi: VALIDATION_ERROR khi loại hoặc trạng thái lọc không hợp lệ.
     */
    async list(filters, paging) {
      checkRoomFilter(filters);
      const { items, total } = await repo.listRooms({ ...filters, ...(paging || {}) });
      return { items: items.map(toRoom), total };
    },

    /** Chi tiết một phòng. Lỗi: NOT_FOUND khi id sai định dạng hoặc không có. */
    async get(id) {
      const room = isUuid(id) ? await repo.findRoom(id) : null;
      if (!room) throw notFound();
      return toRoom(room);
    },

    /**
     * Thêm phòng. Mã tòa suy ra từ mã phòng, tòa chưa có thì tạo, tòa đã có phải khớp cơ sở.
     * Lỗi: VALIDATION_ERROR khi dữ liệu sai, mã trùng hoặc cơ sở không khớp tòa.
     */
    async create(body) {
      const { campus, ...data } = checkRoom(body);
      if (await repo.findRoomByCode(data.code)) throw dupCode();
      const bCode = buildingCode(data.code);
      let building = await repo.findBuildingByCode(bCode);
      if (building && building.campus && building.campus !== campus) {
        throw validation([{ field: 'campus', message: `Tòa ${building.code} thuộc ${building.campus}.` }]);
      }
      if (!building) {
        try {
          building = await repo.createBuilding({ code: bCode, name: `Tòa ${bCode}`, campus });
        } catch (err) {
          // Hai yêu cầu cùng tạo tòa mới: lấy tòa của yêu cầu thắng cuộc rồi đi tiếp, không phải lỗi mã phòng trùng.
          if (!isUniqueViolation(err)) throw err;
          building = await repo.findBuildingByCode(bCode);
          if (building.campus && building.campus !== campus) throw validation([{ field: 'campus', message: `Tòa ${building.code} thuộc ${building.campus}.` }]);
        }
      }
      if (!building.campus) building = await repo.setBuildingCampus(building.id, campus);
      try {
        return toRoom(await repo.createRoom({ ...data, buildingId: building.id }));
      } catch (err) {
        // Hai yêu cầu cùng lúc có thể cùng qua bước kiểm tra, ràng buộc unique của cơ sở dữ liệu là chốt chặn cuối.
        if (isUniqueViolation(err)) throw dupCode();
        throw err;
      }
    },

    /**
     * Sửa phòng. Không đổi mã phòng vì mã gắn với lịch sử sử dụng, không đổi cơ sở vì cơ sở thuộc về tòa nhà.
     * Tòa chưa có cơ sở thì lần sửa đầu gán cơ sở cho tòa.
     * Lỗi: NOT_FOUND, VALIDATION_ERROR.
     */
    async update(id, body) {
      const current = isUuid(id) ? await repo.findRoom(id) : null;
      if (!current) throw notFound();
      if (body.code !== undefined && String(body.code).trim() !== current.code) {
        throw validation([{ field: 'code', message: 'Không đổi mã phòng đã có.' }]);
      }
      const { campus, code, ...data } = checkRoom({ ...body, code: current.code });
      if (current.campus && campus !== current.campus) {
        throw validation([{ field: 'campus', message: 'Không đổi cơ sở của phòng. Tòa nhà thuộc cơ sở này.' }]);
      }
      if (!current.campus) await repo.setBuildingCampus(current.buildingId, campus);
      return toRoom(await repo.updateRoom(current.id, data));
    },
  };
}

module.exports = { createRoomService, toRoom };
