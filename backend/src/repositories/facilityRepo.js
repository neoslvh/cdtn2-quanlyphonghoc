// Tầng repository: mã QR của phòng và thiết bị, check-in, báo hỏng (FR-05, FR-18, FR-19). Không chứa quy tắc nghiệp vụ.
const { isUniqueViolation } = require('../errors');
const { audit, missing } = require('./common');

const eqInclude = { room: { select: { id: true, code: true } } };
const roomSelect = { id: true, code: true, name: true, roomType: true, capacity: true, status: true, qrToken: true };
const incidentInclude = {
  request: { select: { id: true, requestNo: true, room: { select: { code: true } } } },
  equipment: { select: { id: true, assetCode: true, name: true } },
  reporter: { select: { fullName: true } },
};

function createFacilityRepo(prisma) {
  return {
    findRoomQr: (id) => prisma.room.findUnique({ where: { id }, select: roomSelect }).catch(missing),
    findEquipment: (id) => prisma.equipment.findUnique({ where: { id }, include: eqInclude }).catch(missing),

    /** Tài nguyên ứng với token QR: { type: 'ROOM', room } hoặc { type: 'EQUIPMENT', equipment }, không có thì null. */
    findQrTarget: async (token) => {
      const room = await prisma.room.findUnique({ where: { qrToken: token }, select: roomSelect });
      if (room) return { type: 'ROOM', room };
      const equipment = await prisma.equipment.findUnique({ where: { qrToken: token }, include: eqInclude });
      return equipment ? { type: 'EQUIPMENT', equipment } : null;
    },

    listRoomEquipment: (roomId) => prisma.equipment.findMany({ where: { roomId }, include: eqInclude, orderBy: { assetCode: 'asc' } }),

    /** Ghi check-in kèm nhật ký trong một giao dịch. Trả false nếu yêu cầu đã check-in (ràng buộc unique request_id). */
    createCheckin: ({ requestId, userId, roomId, now }) =>
      prisma
        .$transaction(async (tx) => {
          await tx.checkin.create({ data: { requestId, userId, roomId, checkedInAt: now, result: 'SUCCESS' } });
          await audit(tx, { userId, action: 'REQUEST_CHECKED_IN', entityType: 'usage_request', entityId: requestId, after: { roomId, checkedInAt: now.toISOString() } });
          return true;
        })
        .catch((err) => {
          if (isUniqueViolation(err)) return false;
          throw err;
        }),

    /**
     * Tạo báo hỏng, chuyển thiết bị từ GOOD sang BROKEN và ghi nhật ký trong một giao dịch. Cập nhật có điều kiện
     * status GOOD nên hai báo hỏng cùng lúc chỉ một thành công; trả null nếu thiết bị không còn GOOD.
     */
    createIncident: ({ requestId, equipmentId, reportedBy, description, imagePath, imageName }) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.equipment.updateMany({ where: { id: equipmentId, status: 'GOOD' }, data: { status: 'BROKEN' } });
        if (!count) return null;
        const i = await tx.incidentReport.create({ data: { requestId, equipmentId, reportedBy, description, imagePath, imageName, status: 'OPEN' }, include: incidentInclude });
        await audit(tx, { userId: reportedBy, action: 'INCIDENT_REPORTED', entityType: 'incident_report', entityId: i.id, before: { equipmentStatus: 'GOOD' }, after: { equipmentId, equipmentStatus: 'BROKEN', requestId } });
        return i;
      }),

    /** Báo hỏng mới nhất trước, lọc theo trạng thái. Trả { items, total }. */
    listIncidents: async ({ status, page, pageSize }) => {
      const where = status ? { status } : {};
      const [items, total] = await Promise.all([
        prisma.incidentReport.findMany({ where, include: incidentInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.incidentReport.count({ where }),
      ]);
      return { items, total };
    },
  };
}

module.exports = { createFacilityRepo };
