const { ApiError } = require('../errors');
const { isUuid, validation } = require('../http');
const { toRequest, reqCode } = require('./requestService');

// Tầng service: duyệt phiếu theo chuỗi đơn vị (FR-10, FR-11). Mỗi bước chỉ do APPROVER của đơn vị đó quyết định.
function createApprovalService({ repo, availability, clock = () => new Date() }) {
  // Phiếu đang chờ và bước đang chờ của nó. Người không thuộc đơn vị của bước hiện tại thấy 403.
  async function target(user, id) {
    const r = isUuid(id) ? await repo.findRequest(id) : null;
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu.');
    const step = r.steps.find((s) => s.status === 'PENDING');
    if (r.status !== 'PENDING' || !step) throw new ApiError(409, 'INVALID_STATE', 'Yêu cầu không còn ở trạng thái chờ duyệt.');
    if (step.approverOrgId !== user.organizationId) throw new ApiError(403, 'FORBIDDEN', 'Bước duyệt hiện tại không thuộc đơn vị của bạn.');
    return { r, step };
  }
  const stale = () => new ApiError(409, 'INVALID_STATE', 'Yêu cầu đã được xử lý bởi người khác.');
  const reasonOf = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);

  return {
    /** Phiếu đang chờ đơn vị của người duyệt. Trả { items, total }. */
    async listPending(user, paging) {
      const { items, total } = await repo.listPendingApprovals({ orgId: user.organizationId, ...paging });
      return { items: items.map(toRequest), total };
    },

    /**
     * Đồng ý bước hiện tại. Ở bước cuối, kiểm tra lại phòng, lịch học chính khóa và lượt đặt đã duyệt rồi mới tạo
     * lượt đặt; nếu trùng thì không cho duyệt (SCRUM-13). Lỗi: NOT_FOUND, FORBIDDEN, INVALID_STATE, ROOM_UNAVAILABLE, ROOM_CONFLICT.
     */
    async approve(user, id, body) {
      const { r, step } = await target(user, id);
      const last = !r.steps.some((s) => s.stepNo > step.stepNo);
      let booking;
      if (last) {
        if (r.room.status !== 'AVAILABLE') throw new ApiError(409, 'ROOM_UNAVAILABLE', `Phòng ${r.room.code} hiện không khả dụng.`);
        const conflicts = await availability.conflictDetails(r.room.id, r.startAt, r.endAt, { excludeRequestId: r.id });
        if (conflicts.length) throw new ApiError(409, 'ROOM_CONFLICT', `Phòng ${r.room.code} đã có ${conflicts[0].source === 'CLASS_SCHEDULE' ? 'lớp học' : 'lượt đặt được duyệt'} trong khung giờ này nên không thể duyệt.`, conflicts);
        booking = { roomId: r.room.id, startAt: r.startAt, endAt: r.endAt, message: `Yêu cầu ${reqCode(r.requestNo)} dùng phòng ${r.room.code} đã được duyệt.` };
      }
      const res = await repo.approveStep({ requestId: r.id, stepId: step.id, userId: user.id, reason: reasonOf((body || {}).reason), now: clock(), booking, requesterId: r.requesterId });
      if (res === 'STALE') throw stale();
      if (res === 'CONFLICT') throw new ApiError(409, 'ROOM_CONFLICT', `Phòng ${r.room.code} vừa được giữ cho hoạt động khác nên không thể duyệt.`);
      return toRequest(await repo.findRequest(r.id));
    },

    /** Từ chối bước hiện tại, bắt buộc có lý do. Lỗi: VALIDATION_ERROR, NOT_FOUND, FORBIDDEN, INVALID_STATE. */
    async reject(user, id, body) {
      const reason = reasonOf((body || {}).reason);
      if (!reason) throw validation([{ field: 'reason', message: 'Nhập lý do từ chối.' }]);
      const { r, step } = await target(user, id);
      const res = await repo.rejectStep({ requestId: r.id, stepId: step.id, userId: user.id, reason, now: clock(), requesterId: r.requesterId, message: `Yêu cầu ${reqCode(r.requestNo)} bị ${step.organizationName} từ chối: ${reason}` });
      if (res === 'STALE') throw stale();
      return toRequest(await repo.findRequest(r.id));
    },
  };
}

module.exports = { createApprovalService };
