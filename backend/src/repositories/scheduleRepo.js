// Tầng repository: khung tiết, lần nhập thời khóa biểu và các buổi học. Không chứa quy tắc nghiệp vụ.
const { Prisma } = require('@prisma/client');
const { audit, notify } = require('./common');

// Giao dịch dài (xác nhận nhập) có thể phải chờ giao dịch khác nhả khóa dòng, nên cho chờ lấy kết nối lâu hơn mặc định 2 giây
// để các yêu cầu cùng lúc xếp hàng và nhận INVALID_STATE thay vì lỗi hết thời gian chờ (P2028).
const TX = { maxWait: 10000, timeout: 30000 };

const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
const sessionInclude = { room: { select: { code: true } } };

// Buổi học từ Prisma sang dạng phẳng với mã phòng.
const flatSession = (s) => {
  if (!s) return null;
  const { room, ...rest } = s;
  return { ...rest, roomCode: room.code };
};

const flatBatch = (b) => ({ ...b });

function createScheduleRepo(prisma) {
  // Yêu cầu PENDING hoặc APPROVED có khung giờ giao với buổi học của một lần nhập (mỗi yêu cầu một dòng, buổi học sớm nhất).
  // Chạy được cả trong giao dịch (tx) để tính lại lúc xác nhận.
  const conflictsOf = async (client, batchId) => {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT DISTINCT ON (r.id)
        r.id AS "requestId", r.request_no AS "requestNo", r.status AS "requestStatus", r.start_at AS "startAt", r.end_at AS "endAt",
        rm.code AS "roomCode", u.full_name AS "requesterName", cs.course_code AS "courseCode", cs.class_code AS "classCode"
      FROM usage_request r
      JOIN room rm ON rm.id = r.room_id
      JOIN "user" u ON u.id = r.requester_id
      JOIN class_schedule cs ON cs.batch_id = ${batchId}::uuid AND cs.room_id = r.room_id AND tstzrange(cs.start_at, cs.end_at) && tstzrange(r.start_at, r.end_at)
      WHERE r.status IN ('PENDING', 'APPROVED')
      ORDER BY r.id, cs.start_at`);
    return rows.map((x) => ({ ...x, requestNo: Number(x.requestNo) }));
  };

  return {
    listPeriodSlots: async () =>
      (await prisma.periodSlot.findMany({ orderBy: { periodNo: 'asc' } })).map((p) => ({ period: p.periodNo, startTime: hhmm(p.startTime), endTime: hhmm(p.endTime) })),

    /** Map mã phòng -> id cho các mã có trong hệ thống. */
    findRoomsByCodes: async (codes) => new Map((await prisma.room.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } })).map((r) => [r.code, r.id])),

    /** Tạo lần nhập ở trạng thái PREVIEW cùng các buổi học PENDING trong một giao dịch. */
    createImportBatch: ({ importedBy, semester, mode, fileName, rowCount, sessions }) =>
      prisma.$transaction(async (tx) => {
        const batch = await tx.importBatch.create({ data: { importedBy, semester, mode, fileName, status: 'PREVIEW', rowCount, sessionCount: sessions.length, conflictCount: 0 } });
        await tx.classSchedule.createMany({ data: sessions.map((s) => ({ batchId: batch.id, roomId: s.roomId, courseCode: s.courseCode, courseName: s.courseName, classCode: s.classCode, startAt: s.startAt, endAt: s.endAt, status: 'PENDING' })) });
        const conflicts = await conflictsOf(tx, batch.id);
        await audit(tx, { userId: importedBy, action: 'SCHEDULE_IMPORT_PREVIEWED', entityType: 'import_batch', entityId: batch.id, after: { semester, mode, fileName, rowCount, sessionCount: sessions.length, conflictCount: conflicts.length } });
        return { batch: flatBatch(await tx.importBatch.update({ where: { id: batch.id }, data: { conflictCount: conflicts.length } })), conflicts };
      }, TX),

    findBatch: async (id) => {
      const b = await prisma.importBatch.findUnique({ where: { id } }).catch(() => null);
      return b ? flatBatch(b) : null;
    },
    batchConflicts: (batchId) => conflictsOf(prisma, batchId),
    listBatches: async ({ page, pageSize }) => {
      const [items, total] = await Promise.all([prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), prisma.importBatch.count()]);
      return { items: items.map(flatBatch), total };
    },

    /** Hủy bản xem trước: chỉ khi còn PREVIEW. Xóa các buổi học PENDING. Trả true nếu hủy được. */
    discardBatch: (id, actorId) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.importBatch.updateMany({ where: { id, status: 'PREVIEW' }, data: { status: 'DISCARDED' } });
        if (!count) return false;
        await tx.classSchedule.deleteMany({ where: { batchId: id, status: 'PENDING' } });
        await audit(tx, { userId: actorId, action: 'SCHEDULE_IMPORT_DISCARDED', entityType: 'import_batch', entityId: id });
        return true;
      }, TX),

    /**
     * Xác nhận nhập trong một giao dịch (BR-11): tính lại các yêu cầu bị trùng, chuyển buổi học sang ACTIVE, thay thế
     * buổi cũ của học kỳ khi mode REPLACE, hủy các yêu cầu và lượt đặt bị trùng. Trả kết quả, hoặc null nếu không còn PREVIEW.
     */
    commitBatch: (id, { cancelReason, actorId }) =>
      prisma.$transaction(async (tx) => {
        const batch = await tx.importBatch.findUnique({ where: { id } });
        const { count } = await tx.importBatch.updateMany({ where: { id, status: 'PREVIEW' }, data: { status: 'COMMITTED', committedAt: new Date() } });
        if (!count) return null;
        const conflicts = await conflictsOf(tx, id);
        let replaced = 0;
        if (batch.mode === 'REPLACE') {
          replaced = (await tx.classSchedule.updateMany({ where: { status: 'ACTIVE', batch: { semester: batch.semester }, batchId: { not: id } }, data: { status: 'CANCELLED' } })).count;
        }
        const activated = (await tx.classSchedule.updateMany({ where: { batchId: id, status: 'PENDING' }, data: { status: 'ACTIVE' } })).count;
        const ids = conflicts.map((c) => c.requestId);
        if (ids.length) {
          const now = new Date();
          for (const c of conflicts) {
            const reason = cancelReason(c);
            await tx.usageRequest.update({ where: { id: c.requestId }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: now } });
            // BR-11: người đăng ký nhận thông báo kèm lý do, và việc hủy được ghi nhật ký.
            const owner = await tx.usageRequest.findUnique({ where: { id: c.requestId }, select: { requesterId: true } });
            await notify(tx, { userId: owner.requesterId, requestId: c.requestId, title: 'Yêu cầu sử dụng phòng bị hủy', message: reason });
            await audit(tx, { userId: actorId, action: 'REQUEST_CANCELLED_BY_SCHEDULE', entityType: 'usage_request', entityId: c.requestId, before: { status: c.requestStatus }, after: { status: 'CANCELLED', cancelReason: reason, batchId: id } });
          }
          await tx.approvalStep.updateMany({ where: { requestId: { in: ids }, status: { in: ['PENDING', 'WAITING'] } }, data: { status: 'CANCELLED' } });
          await tx.roomBooking.updateMany({ where: { requestId: { in: ids }, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
        }
        await tx.importBatch.update({ where: { id }, data: { conflictCount: conflicts.length } });
        await audit(tx, { userId: actorId, action: 'SCHEDULE_IMPORT_COMMITTED', entityType: 'import_batch', entityId: id, after: { semester: batch.semester, mode: batch.mode, activatedSessions: activated, replacedSessions: replaced, cancelledRequests: ids.length } });
        return { activated, replaced, cancelled: conflicts.map((c) => ({ ...c, cancelReason: cancelReason(c) })) };
      }, TX),

    /** Tra cứu buổi học theo phòng, ngày, trạng thái. Từ ngày và đến ngày là mốc theo giờ Việt Nam đã đổi sang thời điểm. */
    listSessions: async ({ roomCode, from, to, status, page, pageSize }) => {
      const where = {
        ...(roomCode ? { room: { code: roomCode } } : {}),
        ...(status ? { status } : { status: { not: 'PENDING' } }),
        ...(from || to ? { startAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.classSchedule.findMany({ where, include: sessionInclude, orderBy: [{ startAt: 'asc' }, { room: { code: 'asc' } }], skip: (page - 1) * pageSize, take: pageSize }),
        prisma.classSchedule.count({ where }),
      ]);
      return { items: rows.map(flatSession), total };
    },
    findSession: async (id) => flatSession(await prisma.classSchedule.findUnique({ where: { id }, include: sessionInclude }).catch(() => null)),
    /** Sửa buổi học chỉ khi còn ACTIVE. Trả buổi mới, hoặc null nếu không còn ACTIVE. */
    updateSession: (id, data, actorId) =>
      prisma.$transaction(async (tx) => {
        const before = await tx.classSchedule.findUnique({ where: { id }, include: sessionInclude });
        const { count } = await tx.classSchedule.updateMany({ where: { id, status: 'ACTIVE' }, data });
        if (!count) return null;
        const after = await tx.classSchedule.findUnique({ where: { id }, include: sessionInclude });
        await audit(tx, { userId: actorId, action: 'CLASS_SESSION_UPDATED', entityType: 'class_schedule', entityId: id, before: { roomCode: before.room.code, startAt: before.startAt, endAt: before.endAt }, after: { roomCode: after.room.code, startAt: after.startAt, endAt: after.endAt } });
        return flatSession(after);
      }, TX),
    cancelSession: (id, actorId) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.classSchedule.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
        if (!count) return null;
        await audit(tx, { userId: actorId, action: 'CLASS_SESSION_CANCELLED', entityType: 'class_schedule', entityId: id, before: { status: 'ACTIVE' }, after: { status: 'CANCELLED' } });
        return flatSession(await tx.classSchedule.findUnique({ where: { id }, include: sessionInclude }));
      }, TX),
  };
}

module.exports = { createScheduleRepo };
