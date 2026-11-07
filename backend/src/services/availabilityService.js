const { checkAvailableQuery } = require('../validators/availability');
const { toRoom } = require('./roomService');

// Tầng service: quy tắc phòng trống và phát hiện trùng lịch (FR-06, FR-08). Không biết gì về HTTP hay SQL.
const reqCode = (no) => `REQ-${String(no).padStart(3, '0')}`;

function createAvailabilityService(repo) {
  /**
   * Nguồn xung đột của phòng trong khoảng thời gian, dạng chi tiết của lỗi ROOM_CONFLICT.
   * Trả: [] nếu trống, hoặc một phần tử { source: 'CLASS_SCHEDULE', courseCode, classCode } hay { source: 'ROOM_BOOKING', requestCode }.
   */
  async function conflictDetails(roomId, from, to, options) {
    const c = await repo.findRoomConflict(roomId, from, to, options);
    if (!c) return [];
    return [c.source === 'ROOM_BOOKING' ? { source: c.source, requestCode: reqCode(c.requestNo) } : c];
  }

  return {
    conflictDetails,

    /**
     * Tra cứu phòng trống. Một phòng trống khi trạng thái AVAILABLE, đủ sức chứa, không có buổi học ACTIVE
     * (BR-10) và không có lượt đặt ACTIVE (BR-01) giao với khung giờ, và có đủ thiết bị tình trạng tốt.
     * Nhận: query của GET /rooms/available.
     * Trả: { items, page, pageSize, total }.
     * Lỗi: VALIDATION_ERROR khi tham số sai.
     */
    async findAvailable(query) {
      const q = checkAvailableQuery(query);
      const [{ items }, busy] = await Promise.all([
        repo.listRooms({ status: 'AVAILABLE', campus: q.campus, roomType: q.roomType, minCapacity: q.capacity }),
        repo.busyRoomIds(q.from, q.to),
      ]);
      const free = items
        .filter((r) => !busy.has(r.id))
        .filter((r) => q.equipment.every(({ type, qty }) => (r.equipment[type] || 0) >= qty))
        .map(toRoom);
      return { items: free.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page, pageSize: q.pageSize, total: free.length };
    },
  };
}

module.exports = { createAvailabilityService };
