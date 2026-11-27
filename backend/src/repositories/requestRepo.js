// Tầng repository: đọc ghi phiếu đề xuất, thiết bị, tệp đính kèm và các bước duyệt. Không chứa quy tắc nghiệp vụ.
const { Prisma } = require('@prisma/client');
const { audit, missing } = require('./common');

const TX = { maxWait: 10000, timeout: 30000 };

const include = {
  room: { select: { id: true, code: true, name: true, capacity: true, status: true } },
  requester: { select: { fullName: true } },
  organization: { select: { name: true } },
  equipment: true,
  attachments: { orderBy: { createdAt: 'asc' } },
  steps: { include: { approverOrg: { select: { name: true } } }, orderBy: { stepNo: 'asc' } },
  checkin: { select: { checkedInAt: true, result: true } },
};

// Phiếu từ Prisma sang dạng phẳng mà service dùng.
function flatRequest(r) {
  if (!r) return null;
  const { requester, organization, equipment, attachments, steps, ...rest } = r;
  return {
    ...rest,
    requesterName: requester.fullName,
    organizationName: organization.name,
    equipment: equipment.map((e) => ({ itemType: e.itemType, quantity: e.quantity, otherDescription: e.otherDescription })),
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, type: a.type })),
    steps: steps.map((s) => ({ id: s.id, stepNo: s.stepNo, approverOrgId: s.approverOrgId, organizationName: s.approverOrg.name, status: s.status, decisionReason: s.decisionReason, decidedAt: s.decidedAt })),
  };
}

function createRequestRepo(prisma) {
  const find = (id) => prisma.usageRequest.findUnique({ where: { id }, include }).then(flatRequest);
  return {
    findRequest: (id) => find(id).catch(missing),
    findOrganizationByName: (name) => prisma.organization.findFirst({ where: { name, active: true } }),

    // log là mục nhật ký (hoặc hàm nhận kết quả để dựng mục nhật ký), được ghi trong cùng giao dịch với thao tác chính.
    createRequest: ({ requesterId, equipment, ...data }, log) =>
      prisma.$transaction(async (tx) => {
        const created = flatRequest(await tx.usageRequest.create({ data: { ...data, requesterId, status: 'DRAFT', equipment: { create: equipment } }, include }));
        if (log) await audit(tx, log(created));
        return created;
      }),

    /**
     * Sửa phiếu nháp: cập nhật có điều kiện status DRAFT và thay toàn bộ danh sách thiết bị trong một giao dịch.
     * Trả phiếu mới, hoặc null nếu phiếu không còn là DRAFT (vừa được gửi hoặc hủy).
     */
    updateRequest: async (id, { equipment, ...data }, log) => {
      const ok = await prisma.$transaction(async (tx) => {
        const { count } = await tx.usageRequest.updateMany({ where: { id, status: 'DRAFT' }, data });
        if (!count) return false;
        await tx.requestEquipment.deleteMany({ where: { requestId: id } });
        await tx.requestEquipment.createMany({ data: equipment.map((e) => ({ ...e, requestId: id })) });
        if (log) await audit(tx, log);
        return true;
      });
      return ok ? find(id) : null;
    },

    /** Danh sách phiếu mới nhất trước. requesterId bỏ trống thì lấy của mọi người. Trả { items, total }. */
    listRequests: async ({ requesterId, status, page, pageSize }) => {
      const where = { ...(requesterId ? { requesterId } : {}), ...(status ? { status } : {}) };
      const [rows, total] = await Promise.all([
        prisma.usageRequest.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.usageRequest.count({ where }),
      ]);
      return { items: rows.map(flatRequest), total };
    },

    /** Phiếu PENDING có bước đang chờ của đơn vị orgId (bỏ trống thì của mọi đơn vị), cũ nhất trước. Trả { items, total }. */
    listPendingApprovals: async ({ orgId, after, page, pageSize }) => {
      const where = { status: 'PENDING', ...(after ? { startAt: { gt: after } } : {}), steps: { some: { status: 'PENDING', ...(orgId ? { approverOrgId: orgId } : {}) } } };
      const [rows, total] = await Promise.all([
        prisma.usageRequest.findMany({ where, include, orderBy: { submittedAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.usageRequest.count({ where }),
      ]);
      return { items: rows.map(flatRequest), total };
    },

    /**
     * BR-07: chuyển các yêu cầu PENDING đã đến giờ bắt đầu sang EXPIRED trong một giao dịch, hủy các bước còn chờ,
     * gửi thông báo cho người đăng ký và ghi nhật ký (người thực hiện là hệ thống). Một lệnh UPDATE ... RETURNING có điều kiện
     * status PENDING nên chạy song song hay chạy trùng với một lần duyệt cũng không xử lý một phiếu hai lần, và số truy vấn
     * không tăng theo số phiếu quá hạn. Trả danh sách phiếu đã hết hạn.
     */
    expireOverdue: (now, message) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw(Prisma.sql`
          UPDATE usage_request u SET status = 'EXPIRED' FROM room rm
          WHERE rm.id = u.room_id AND u.status = 'PENDING' AND u.start_at <= ${now}
          RETURNING u.id, u.request_no AS "requestNo", u.requester_id AS "requesterId", rm.code AS "roomCode"`);
        if (!rows.length) return [];
        const done = rows.map(({ roomCode, ...r }) => ({ ...r, room: { code: roomCode } }));
        const ids = done.map((r) => r.id);
        await tx.approvalStep.updateMany({ where: { requestId: { in: ids }, status: { in: ['PENDING', 'WAITING'] } }, data: { status: 'CANCELLED' } });
        await tx.notification.createMany({ data: done.map((r) => ({ userId: r.requesterId, requestId: r.id, title: 'Yêu cầu sử dụng phòng đã hết hạn', message: message(r) })) });
        await tx.auditLog.createMany({ data: ids.map((id) => ({ userId: null, action: 'REQUEST_EXPIRED', entityType: 'usage_request', entityId: id, beforeData: { status: 'PENDING' }, afterData: { status: 'EXPIRED' } })) });
        return done;
      }, TX),

    addAttachment: (requestId, data) => prisma.requestAttachment.create({ data: { requestId, ...data } }),

    /**
     * Chuyển phiếu từ DRAFT sang PENDING và tạo các bước duyệt trong cùng một giao dịch.
     * Trả phiếu mới, hoặc null nếu phiếu không còn là DRAFT (đã có yêu cầu khác gửi trước).
     */
    submitRequest: async (id, steps, now, log) => {
      const ok = await prisma.$transaction(async (tx) => {
        const { count } = await tx.usageRequest.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PENDING', submittedAt: now } });
        if (!count) return false;
        await tx.approvalStep.createMany({ data: steps.map((s) => ({ ...s, requestId: id })) });
        if (log) await audit(tx, log);
        return true;
      });
      return ok ? find(id) : null;
    },

    /** Hủy phiếu DRAFT hoặc PENDING cùng các bước chưa xử lý. Trả phiếu mới, hoặc null nếu không còn hủy được. */
    cancelRequest: async (id, reason, now, log) => {
      const ok = await prisma.$transaction(async (tx) => {
        const { count } = await tx.usageRequest.updateMany({ where: { id, status: { in: ['DRAFT', 'PENDING'] } }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: now } });
        if (!count) return false;
        await tx.approvalStep.updateMany({ where: { requestId: id, status: { in: ['PENDING', 'WAITING'] } }, data: { status: 'CANCELLED' } });
        if (log) await audit(tx, log);
        return true;
      });
      return ok ? find(id) : null;
    },
  };
}

module.exports = { createRequestRepo, flatRequest };
