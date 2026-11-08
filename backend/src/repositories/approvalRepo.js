// Tầng repository: ghi quyết định duyệt. Mỗi quyết định là một giao dịch gồm phiếu, bước duyệt, lượt đặt, nhật ký và thông báo.
const { audit, notify } = require('./common');

// Ném trong giao dịch khi phiếu hoặc bước đã bị xử lý bởi yêu cầu khác, để mọi thay đổi trước đó được hoàn tác.
const STALE = Symbol('stale');
const TX = { maxWait: 10000, timeout: 30000 };
const isOverlap = (err) => /room_booking_no_overlap|exclusion constraint/i.test(String(err && err.message));

function createApprovalRepo(prisma) {
  const run = async (fn) => {
    try {
      return await prisma.$transaction(fn, TX);
    } catch (err) {
      if (err === STALE) return 'STALE';
      if (isOverlap(err)) return 'CONFLICT';
      throw err;
    }
  };

  return {
    /**
     * Đồng ý một bước. Bước cuối (có booking) chuyển phiếu sang APPROVED và tạo room_booking ACTIVE; ràng buộc loại trừ
     * của cơ sở dữ liệu là chốt chặn cuối nếu có lượt đặt khác chen vào giữa lúc kiểm tra và lúc ghi.
     * Trả 'OK', 'STALE' (phiếu hoặc bước đã đổi), hoặc 'CONFLICT' (phòng bị chiếm).
     */
    approveStep: ({ requestId, stepId, userId, reason, now, booking, requesterId }) =>
      run(async (tx) => {
        // Hủy, từ chối và nhập lịch học đều chuyển bước PENDING sang trạng thái khác, nên cập nhật có điều kiện bước này đã đủ để tuần tự hóa.
        const { count } = await tx.approvalStep.updateMany({ where: { id: stepId, requestId, status: 'PENDING', request: { status: 'PENDING' } }, data: { status: 'APPROVED', approverUserId: userId, decisionReason: reason, decidedAt: now } });
        if (!count) throw STALE;
        if (booking) {
          const moved = await tx.usageRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'APPROVED' } });
          if (!moved.count) throw STALE;
          await tx.roomBooking.create({ data: { requestId, roomId: booking.roomId, startAt: booking.startAt, endAt: booking.endAt, status: 'ACTIVE' } });
          await notify(tx, { userId: requesterId, requestId, title: 'Yêu cầu sử dụng phòng đã được duyệt', message: booking.message });
        } else {
          const next = await tx.approvalStep.findFirst({ where: { requestId, status: 'WAITING' }, orderBy: { stepNo: 'asc' } });
          if (next) await tx.approvalStep.update({ where: { id: next.id }, data: { status: 'PENDING' } });
        }
        await audit(tx, { userId, action: booking ? 'REQUEST_APPROVED' : 'REQUEST_STEP_APPROVED', entityType: 'usage_request', entityId: requestId, before: { status: 'PENDING' }, after: { status: booking ? 'APPROVED' : 'PENDING', stepId } });
        return 'OK';
      }),

    /** Từ chối một bước: phiếu sang REJECTED, các bước chưa tới bị hủy. Trả 'OK' hoặc 'STALE'. */
    rejectStep: ({ requestId, stepId, userId, reason, now, requesterId, message }) =>
      run(async (tx) => {
        const moved = await tx.usageRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'REJECTED' } });
        if (!moved.count) throw STALE;
        const { count } = await tx.approvalStep.updateMany({ where: { id: stepId, requestId, status: 'PENDING' }, data: { status: 'REJECTED', approverUserId: userId, decisionReason: reason, decidedAt: now } });
        if (!count) throw STALE;
        await tx.approvalStep.updateMany({ where: { requestId, status: 'WAITING' }, data: { status: 'CANCELLED' } });
        await notify(tx, { userId: requesterId, requestId, title: 'Yêu cầu sử dụng phòng bị từ chối', message });
        await audit(tx, { userId, action: 'REQUEST_REJECTED', entityType: 'usage_request', entityId: requestId, before: { status: 'PENDING' }, after: { status: 'REJECTED', reason, stepId } });
        return 'OK';
      }),
  };
}

module.exports = { createApprovalRepo };
