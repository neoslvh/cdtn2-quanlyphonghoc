const { ApiError } = require('../errors');
const { isUuid, validation } = require('../http');
const { readRows } = require('../importParser');
const { fromVN, parts } = require('../timeVN');
const { checkImportParams, checkInternalOverlap, checkRows, checkSessionPatch, expandSessions, importInvalid } = require('../validators/schedule');

// Tầng service: nhập và quản lý thời khóa biểu chính khóa của Phòng Đào tạo (FR-23, BR-10, BR-11, BR-12).
// Không biết gì về HTTP hay SQL. Tệp chỉ được đọc trong bộ nhớ, không lưu lại trên máy chủ.

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const reqCode = (no) => `REQ-${String(no).padStart(3, '0')}`;
const notFound = (what = 'lần nhập') => new ApiError(404, 'NOT_FOUND', `Không tìm thấy ${what}.`);

const toConflict = (c) => ({
  requestId: c.requestId,
  requestCode: reqCode(c.requestNo),
  requesterName: c.requesterName,
  roomCode: c.roomCode,
  startAt: c.startAt.toISOString(),
  endAt: c.endAt.toISOString(),
  requestStatus: c.requestStatus,
  conflictWith: { courseCode: c.courseCode, classCode: c.classCode },
});

const toPreview = (b, conflicts) => ({
  batchId: b.id,
  status: b.status,
  semester: b.semester,
  mode: b.mode,
  rowCount: b.rowCount,
  sessionCount: b.sessionCount,
  conflicts: conflicts.map(toConflict),
});

const toSession = (s) => ({
  id: s.id,
  roomCode: s.roomCode,
  courseCode: s.courseCode,
  courseName: s.courseName,
  classCode: s.classCode,
  startAt: s.startAt.toISOString(),
  endAt: s.endAt.toISOString(),
  status: s.status,
});

// Ngày dd/mm/yyyy hoặc yyyy-mm-dd của ô lọc, đổi thành mốc đầu ngày theo giờ Việt Nam.
function dayStart(text, field) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!m) throw validation([{ field, message: 'Ngày dạng yyyy-mm-dd.' }]);
  return fromVN(Number(m[1]), Number(m[2]), Number(m[3]));
}

function createScheduleService({ repo, availability }) {
  async function slotMap() {
    return new Map((await repo.listPeriodSlots()).map((p) => [p.period, { start: p.startTime.split(':').map(Number), end: p.endTime.split(':').map(Number) }]));
  }

  async function batchOrFail(id) {
    const b = isUuid(id) ? await repo.findBatch(id) : null;
    if (!b) throw notFound();
    return b;
  }

  return {
    periodSlots: async () => ({ items: await repo.listPeriodSlots() }),

    /**
     * Nhập thời khóa biểu bước 1: kiểm tra toàn bộ tệp, nếu hợp lệ tạo bản xem trước (PREVIEW) kèm danh sách yêu cầu bị trùng.
     * Một dòng sai thì không lưu dòng nào (BR-12).
     * Nhận: user, file { originalname, size, buffer }, params { semester, mode }.
     * Lỗi: VALIDATION_ERROR, FILE_TOO_LARGE (413), UNSUPPORTED_FILE_TYPE (415), IMPORT_INVALID (422) kèm lỗi từng dòng.
     */
    async createImport(user, file, params) {
      const { semester, mode } = checkImportParams(params);
      if (!file) throw validation([{ field: 'file', message: 'Chọn tệp thời khóa biểu.' }]);
      if (file.size > MAX_FILE_BYTES) throw new ApiError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn 5 MB.');
      const rows = await readRows(file);
      const slots = await slotMap();
      const codes = [...new Set(rows.slice(1).map((r) => r[7]).filter(Boolean))];
      const roomIds = await repo.findRoomsByCodes(codes);
      const { parsed, errors } = checkRows(rows, { semester, slots, roomCodes: new Set(roomIds.keys()) });
      const sessions = errors.length ? [] : expandSessions(parsed, slots);
      if (!errors.length) errors.push(...checkInternalOverlap(sessions));
      if (errors.length) throw importInvalid(errors.sort((a, b) => a.row - b.row));
      const { batch, conflicts } = await repo.createImportBatch({
        importedBy: user.id,
        semester,
        mode,
        fileName: String(file.originalname).slice(0, 255),
        rowCount: parsed.length,
        sessions: sessions.map((s) => ({ ...s, roomId: roomIds.get(s.roomCode) })),
      });
      return toPreview(batch, conflicts);
    },

    /** Chi tiết bản xem trước kèm danh sách yêu cầu bị trùng. */
    async getImport(id) {
      const b = await batchOrFail(id);
      return toPreview(b, b.status === 'PREVIEW' ? await repo.batchConflicts(b.id) : []);
    },

    async listImports(paging) {
      const { items, total } = await repo.listBatches(paging);
      return { items: items.map((b) => ({ id: b.id, status: b.status, semester: b.semester, mode: b.mode, fileName: b.fileName, rowCount: b.rowCount, sessionCount: b.sessionCount, conflictCount: b.conflictCount, createdAt: b.createdAt.toISOString() })), total };
    },

    /**
     * Xác nhận nhập: buổi học có hiệu lực, REPLACE thì buổi cũ của học kỳ bị thay thế, yêu cầu và lượt đặt bị trùng bị hủy
     * kèm lý do ghi rõ lớp học gây trùng (BR-11). Tất cả trong một giao dịch.
     * Lỗi: NOT_FOUND, INVALID_STATE khi lần nhập không còn ở trạng thái xem trước.
     */
    async commit(user, id) {
      await batchOrFail(id);
      const result = await repo.commitBatch(id, {
        actorId: user.id,
        cancelReason: (c) => `Phòng ${c.roomCode} có lớp ${c.courseCode} (${c.classCode}) theo thời khóa biểu mới của Phòng Đào tạo.`,
      });
      if (!result) throw new ApiError(409, 'INVALID_STATE', 'Lần nhập này không còn ở trạng thái xem trước.');
      return {
        batchId: id,
        status: 'COMMITTED',
        activatedSessions: result.activated,
        replacedSessions: result.replaced,
        cancelledRequests: result.cancelled.map((c) => ({ id: c.requestId, requestCode: reqCode(c.requestNo), requesterName: c.requesterName, cancelReason: c.cancelReason })),
      };
    },

    /** Hủy bản xem trước. Lỗi: NOT_FOUND, INVALID_STATE. */
    async discard(user, id) {
      await batchOrFail(id);
      if (!(await repo.discardBatch(id, user.id))) throw new ApiError(409, 'INVALID_STATE', 'Lần nhập này không còn ở trạng thái xem trước.');
    },

    /** Tra cứu buổi học theo phòng, khoảng ngày (yyyy-mm-dd) và trạng thái. Mặc định không hiện buổi PENDING của bản xem trước. */
    async listSessions({ roomCode, from, to, status }, paging) {
      if (status && !['ACTIVE', 'CANCELLED', 'PENDING'].includes(status)) throw validation([{ field: 'status', message: 'Trạng thái không hợp lệ.' }]);
      const range = { from: from ? dayStart(from, 'from') : undefined };
      // Đến ngày tính hết ngày đó, nên lấy đầu ngày kế tiếp làm mốc loại trừ.
      if (to) {
        const t = dayStart(to, 'to');
        const p = parts(t);
        range.to = fromVN(p.y, p.m, p.d + 1);
      }
      const { items, total } = await repo.listSessions({ roomCode: roomCode || undefined, status, ...range, ...paging });
      return { items: items.map(toSession), total };
    },

    /**
     * Sửa giờ hoặc phòng của một buổi học đang ACTIVE. Phòng và giờ mới không được trùng buổi học khác hay lượt đặt đã duyệt.
     * Lỗi: NOT_FOUND, VALIDATION_ERROR, INVALID_STATE, ROOM_CONFLICT.
     */
    async updateSession(user, id, body) {
      const current = isUuid(id) ? await repo.findSession(id) : null;
      if (!current) throw notFound('buổi học');
      const patch = checkSessionPatch(body);
      if (current.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'Chỉ sửa được buổi học đang hiệu lực.');
      const roomCode = patch.roomCode || current.roomCode;
      const startAt = patch.startAt || current.startAt;
      const endAt = patch.endAt || current.endAt;
      if (endAt <= startAt) throw validation([{ field: 'endAt', message: 'Giờ kết thúc phải sau giờ bắt đầu.' }]);
      const room = (await repo.findRoomsByCodes([roomCode])).get(roomCode);
      if (!room) throw validation([{ field: 'roomCode', message: 'Phòng không tồn tại.' }]);
      const conflicts = await availability.conflictDetails(room, startAt, endAt, { excludeSessionId: id });
      if (conflicts.length) throw new ApiError(409, 'ROOM_CONFLICT', `Phòng ${roomCode} đã có lớp học hoặc lượt đặt trong khung giờ này.`, conflicts);
      const updated = await repo.updateSession(id, { roomId: room, startAt, endAt }, user.id);
      if (!updated) throw new ApiError(409, 'INVALID_STATE', 'Chỉ sửa được buổi học đang hiệu lực.');
      return toSession(updated);
    },

    /** Hủy một buổi học (nghỉ, học bù). Lỗi: NOT_FOUND, INVALID_STATE. */
    async cancelSession(user, id) {
      const current = isUuid(id) ? await repo.findSession(id) : null;
      if (!current) throw notFound('buổi học');
      const cancelled = await repo.cancelSession(id, user.id);
      if (!cancelled) throw new ApiError(409, 'INVALID_STATE', 'Chỉ hủy được buổi học đang hiệu lực.');
      return toSession(cancelled);
    },
  };
}

module.exports = { createScheduleService, toSession, toPreview, MAX_FILE_BYTES };
