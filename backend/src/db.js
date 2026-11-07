const { PrismaClient } = require("@prisma/client");

function createDatabase() {
  const prisma = new PrismaClient();
  const withOrganization = { include: { organization: true } };
  const missing = (error) => {
    if (["P2023", "P2025"].includes(error?.code)) return null;
    throw error;
  };

  return {
    countRooms: () => prisma.room.count(),
    listRooms: ({ query, building, roomType, minCapacity, availableFrom, availableTo, equipmentType, equipmentQuantity, includeInactive = false }) => prisma.room.findMany({
      where: {
        ...(includeInactive ? {} : { status: "ACTIVE" }),
        ...(query || building ? { AND: [
          ...(query ? [{ OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] }] : []),
          ...(building ? [{ OR: [{ building: { equals: building, mode: "insensitive" } }, { buildingRef: { is: { code: { equals: building, mode: "insensitive" } } } }] }] : []),
        ] } : {}),
        ...(roomType ? { roomType } : {}),
        ...(minCapacity ? { capacity: { gte: minCapacity } } : {}),
        ...(equipmentType ? { equipment: { some: { equipmentType, status: "ACTIVE" } } } : {}),
        ...(availableFrom && availableTo ? {
          bookings: { none: { status: "ACTIVE", startAt: { lt: availableTo }, endAt: { gt: availableFrom } } },
          schedules: { none: { status: "ACTIVE", startAt: { lt: availableTo }, endAt: { gt: availableFrom } } },
          requests: { none: { status: { in: ["PENDING", "APPROVED"] }, startAt: { lt: availableTo }, endAt: { gt: availableFrom } } },
        } : {})
      },
      include: { equipment: { where: { status: "ACTIVE" } }, buildingRef: true },
      orderBy: { code: "asc" },
    }).then((rooms) => equipmentType && equipmentQuantity ? rooms.filter((room) => room.equipment.filter((item) => item.equipmentType === equipmentType).length >= equipmentQuantity) : rooms),
    createRoom: (data) => prisma.room.create({ data }),
    updateRoom: (id, data) => prisma.room.update({ where: { id }, data }).catch(missing),
    findRoom: (id) => prisma.room.findUnique({ where: { id } }).catch(missing),
    findRoomByCode: (code) => prisma.room.findUnique({ where: { code } }).catch(missing),
    findEquipmentByIds: (ids) => prisma.equipment.findMany({ where: { id: { in: ids } }, include: { room: true } }),
    countActiveEquipmentByType: (roomId, types) => prisma.equipment.groupBy({ where: { status: "ACTIVE", ...(roomId ? { roomId } : {}), equipmentType: { in: types } }, by: ["equipmentType"], _count: { _all: true } }),
    findConflict: ({ roomId, startAt, endAt, exceptRequestId }) => prisma.usageRequest.findFirst({ where: { roomId, status: { in: ["PENDING", "APPROVED"] }, ...(exceptRequestId ? { id: { not: exceptRequestId } } : {}), startAt: { lt: endAt }, endAt: { gt: startAt } } }),
    findBookingConflict: ({ roomId, startAt, endAt }) => prisma.roomBooking.findFirst({ where: { roomId, status: "ACTIVE", startAt: { lt: endAt }, endAt: { gt: startAt } } }),
    findAllConflicts: async ({ roomId, startAt, endAt, exceptRequestId }) => {
      const [schedule, request, booking] = await Promise.all([
        prisma.classSchedule.findFirst({ where: { roomId, status: "ACTIVE", startAt: { lt: endAt }, endAt: { gt: startAt } } }),
        prisma.usageRequest.findFirst({ where: { roomId, status: { in: ["PENDING", "APPROVED"] }, ...(exceptRequestId ? { id: { not: exceptRequestId } } : {}), startAt: { lt: endAt }, endAt: { gt: startAt } } }),
        prisma.roomBooking.findFirst({ where: { roomId, status: "ACTIVE", startAt: { lt: endAt }, endAt: { gt: startAt } } }),
      ]);
      return { schedule, request, booking };
    },
    findScheduleConflict: ({ roomId, startAt, endAt, exceptScheduleId }) => prisma.classSchedule.findFirst({ where: { roomId, status: "ACTIVE", ...(exceptScheduleId ? { id: { not: exceptScheduleId } } : {}), startAt: { lt: endAt }, endAt: { gt: startAt } } }),
    createRequest: (data) => prisma.usageRequest.create({ data, include: { room: true, equipment: { include: { equipment: true } } } }),
    findRequest: (id) => prisma.usageRequest.findUnique({ where: { id }, include: { room: true, requester: true, equipment: { include: { equipment: true } }, approvalSteps: { orderBy: { stepNumber: "asc" } } } }).catch(missing),
    listRequests: (where) => prisma.usageRequest.findMany({ where, orderBy: { createdAt: "desc" }, include: { room: true, requester: true } }),
    updateRequest: (id, data) => prisma.usageRequest.update({ where: { id }, data, include: { room: true } }).catch(missing),
    updateRequestWithEquipment: (id, data, equipment) => prisma.$transaction(async (tx) => {
      await tx.requestEquipment.deleteMany({ where: { requestId: id } });
      return tx.usageRequest.update({ where: { id }, data: { ...data, equipment: { create: equipment.map(({ equipmentId, quantity }) => ({ equipmentId, quantity })) } }, include: { room: true, equipment: { include: { equipment: true } } } });
    }),
    createBooking: (data) => prisma.roomBooking.create({ data }),
    listEquipment: (where = {}) => prisma.equipment.findMany({ where, orderBy: { assetCode: "asc" }, include: { room: true } }),
    createEquipment: (data) => prisma.equipment.create({ data, include: { room: true } }),
    updateEquipment: (id, data) => prisma.equipment.update({ where: { id }, data, include: { room: true } }).catch(missing),
    createSchedule: (data) => prisma.classSchedule.create({ data, include: { room: true } }),
    listSchedules: (where = {}) => prisma.classSchedule.findMany({ where, orderBy: { startAt: "asc" }, include: { room: true } }),
    updateSchedule: (id, data) => prisma.classSchedule.update({ where: { id }, data, include: { room: true } }).catch(missing),
    cancelSchedule: (id) => prisma.classSchedule.update({ where: { id }, data: { status: "CANCELLED" }, include: { room: true } }).catch(missing),
    listPeriodSlots: () => prisma.periodSlot.findMany({ orderBy: { slotNumber: "asc" } }),
    createImportBatch: (data) => prisma.importBatch.create({ data }),
    importSchedules: ({ batchId, schedules, replaceSemester }) => prisma.$transaction(async (tx) => {
      if (replaceSemester) await tx.classSchedule.updateMany({ where: { semester: replaceSemester, status: "ACTIVE" }, data: { status: "CANCELLED" } });
      await tx.classSchedule.createMany({ data: schedules.map((item) => ({ ...item, importBatchId: batchId })) });
      return tx.importBatch.update({ where: { id: batchId }, data: { status: "IMPORTED" } });
    }),
    createApprovalStep: (data) => prisma.approvalStep.create({ data }),
    findPendingStep: (requestId) => prisma.approvalStep.findFirst({ where: { requestId, status: "PENDING" }, orderBy: { stepNumber: "asc" } }),
    updateApprovalStep: (id, data) => prisma.approvalStep.update({ where: { id }, data }),
    countPendingSteps: (requestId) => prisma.approvalStep.count({ where: { requestId, status: "PENDING" } }),
    listApprovalSteps: (requestId) => prisma.approvalStep.findMany({ where: { requestId }, orderBy: { stepNumber: "asc" } }),
    listApprovalRules: () => prisma.approvalRule.findMany({ where: { active: true }, orderBy: [{ priority: "asc" }, { code: "asc" }] }),
    listAllApprovalRules: () => prisma.approvalRule.findMany({ orderBy: [{ priority: "asc" }, { code: "asc" }] }),
    createApprovalRule: (data) => prisma.approvalRule.create({ data }),
    updateApprovalRule: (id, data) => prisma.approvalRule.update({ where: { id }, data }).catch(missing),
    approveStep: ({ requestId, stepId, approverUserId }) => prisma.$transaction(async (tx) => {
      const step = await tx.approvalStep.findFirst({ where: { id: stepId, requestId, status: "PENDING" } });
      if (!step) return null;
      await tx.approvalStep.update({ where: { id: step.id }, data: { status: "APPROVED", approverUserId, decisionAt: new Date() } });
      const remaining = await tx.approvalStep.count({ where: { requestId, status: "PENDING" } });
      if (remaining) return { final: false };
      const request = await tx.usageRequest.findUnique({ where: { id: requestId } });
      await tx.roomBooking.create({ data: { roomId: request.roomId, startAt: request.startAt, endAt: request.endAt, status: "ACTIVE" } });
      const updated = await tx.usageRequest.update({ where: { id: requestId }, data: { status: "APPROVED" } });
      return { final: true, request: updated };
    }),
    createAuditLog: (data) => prisma.$executeRaw`INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, created_at) VALUES (gen_random_uuid(), ${data.userId}, ${data.action}, ${data.entityType}, ${String(data.entityId)}, now())`,
    createNotification: (data) => prisma.$executeRaw`INSERT INTO notification (id, user_id, request_id, title, body, created_at) VALUES (gen_random_uuid(), ${data.userId}::uuid, ${data.requestId}::uuid, ${data.title}, ${data.body}, now())`,
    healthcheck: () => prisma.$queryRawUnsafe("SELECT 1"),
    listOrganizations: ({ all }) =>
      prisma.organization.findMany({
        where: { active: true, ...(all ? {} : { type: "REQUESTER_UNIT" }) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true },
      }),
    findOrganization: (id) =>
      prisma.organization.findUnique({ where: { id } }).catch(missing),
    findUserByEmail: (email) =>
      prisma.user.findUnique({ where: { email }, ...withOrganization }),
    findUserById: (id) =>
      prisma.user.findUnique({ where: { id }, ...withOrganization }).catch(missing),
    createUser: (data) => prisma.user.create({ data }),
    listUsers: ({ status }) =>
      prisma.user.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: "desc" },
        ...withOrganization,
      }),
    updateUser: (id, data) =>
      prisma.user.update({ where: { id }, data, ...withOrganization }).catch(missing),
    createSession: (data) => prisma.authSession.create({ data }),
    findSession: (id) => prisma.authSession.findUnique({ where: { id } }).catch(missing),
    revokeSession: (id, reason = "LOGOUT") => prisma.authSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }),
    revokeUserSessions: (userId, reason) => prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }),
    disconnect: () => prisma.$disconnect(),
  };
}

module.exports = { createDatabase };
