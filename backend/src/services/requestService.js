const path = require('path');
const { ApiError } = require('../errors');
const { isUuid, validation } = require('../http');
const { LATEST_END_MINUTES, addWorkdays, minutesOfDay, sameDay } = require('../timeVN');
const { checkRequestBody } = require('../validators/request');

// Tầng service: quy tắc nghiệp vụ của phiếu đề xuất sử dụng phòng (FR-07, FR-08, FR-09). Không biết gì về HTTP hay SQL.
// repo, availability, storage và clock được truyền qua constructor nên kiểm thử được mà không cần cơ sở dữ liệu hay đồng hồ thật.

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_EXTENSIONS = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
const MAX_ATTACHMENTS = 5;
const LEAD_WORKDAYS = 3;
const BGH_THRESHOLD = 200;

// Chữ ký đầu tệp theo từng định dạng, để tệp đổi đuôi (ví dụ .exe đổi thành .pdf) bị từ chối.
const SIGNATURES = {
  '.pdf': [[0x25, 0x50, 0x44, 0x46]],
  '.png': [[0x89, 0x50, 0x4e, 0x47]],
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.docx': [[0x50, 0x4b, 0x03, 0x04]],
  '.doc': [[0xd0, 0xcf, 0x11, 0xe0]],
};
const matchesSignature = (ext, buf) => (SIGNATURES[ext] || []).some((sig) => buf.length >= sig.length && sig.every((b, i) => buf[i] === b));

const reqCode = (no) => `REQ-${String(no).padStart(3, '0')}`;
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu.');

// Đối tượng trả về cho giao diện. steps là tiến độ duyệt, đã có khi phiếu được gửi.
const toRequest = (r) => ({
  id: r.id,
  code: reqCode(r.requestNo),
  status: r.status,
  requesterName: r.requesterName,
  organizationId: r.organizationId,
  organizationName: r.organizationName,
  room: { id: r.room.id, code: r.room.code, name: r.room.name, capacity: r.room.capacity },
  purpose: r.purpose,
  startAt: r.startAt.toISOString(),
  endAt: r.endAt.toISOString(),
  participantCount: r.participantCount,
  equipment: r.equipment,
  attachments: r.attachments.map((a) => ({ id: a.id, fileName: a.fileName })),
  steps: r.steps.map((s) => ({ order: s.stepNo, organizationName: s.organizationName, status: s.status })),
  createdAt: r.createdAt.toISOString(),
  submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
  cancelReason: r.cancelReason || null,
});

/**
 * Chuỗi đơn vị duyệt mặc định: Phòng Đào tạo, thêm Ban Giám hiệu khi từ 200 người, cuối cùng Phòng Quản trị cơ sở vật chất.
 * Tạm cố định trong mã đến khi có bảng quy tắc duyệt (PB-12, PB-16).
 */
const approvalChain = (participantCount) => ['Phòng Đào tạo', ...(participantCount >= BGH_THRESHOLD ? ['Ban Giám hiệu'] : []), 'Phòng Quản trị cơ sở vật chất'];

function createRequestService({ repo, availability, storage, clock = () => new Date() }) {
  // Phiếu của chính người dùng. Người khác vào phiếu không thuộc mình thì báo không tìm thấy để không lộ phiếu tồn tại.
  async function owned(user, id) {
    const r = isUuid(id) ? await repo.findRequest(id) : null;
    if (!r || r.requesterId !== user.id) throw notFound();
    return r;
  }

  async function checkRefs(user, data) {
    const room = await repo.findRoom(data.roomId);
    if (!room) throw validation([{ field: 'roomId', message: 'Phòng không tồn tại.' }]);
    const org = await repo.findOrganization(data.organizationId);
    if (!org || !org.active || org.type !== 'REQUESTER_UNIT') throw validation([{ field: 'organizationId', message: 'Đơn vị đăng ký không hợp lệ.' }]);
  }

  return {
    /** Tạo phiếu ở trạng thái nháp, chỉ kiểm tra định dạng và phòng, đơn vị có thật. */
    async create(user, body) {
      const data = checkRequestBody(body);
      await checkRefs(user, data);
      return toRequest(await repo.createRequest({ ...data, requesterId: user.id }));
    },

    /** Sửa phiếu khi còn là nháp. Lỗi: NOT_FOUND, INVALID_STATE khi đã gửi. */
    async update(user, id, body) {
      const current = await owned(user, id);
      if (current.status !== 'DRAFT') throw new ApiError(409, 'INVALID_STATE', 'Chỉ sửa được yêu cầu đang ở trạng thái nháp.');
      const data = checkRequestBody(body);
      await checkRefs(user, data);
      const updated = await repo.updateRequest(id, data);
      // null nghĩa là phiếu vừa được gửi hoặc hủy giữa hai bước.
      if (!updated) throw new ApiError(409, 'INVALID_STATE', 'Chỉ sửa được yêu cầu đang ở trạng thái nháp.');
      return toRequest(updated);
    },

    /**
     * Xem một phiếu. Người đăng ký chỉ xem phiếu của mình, ADMIN và FACILITY_STAFF xem mọi phiếu.
     * Phiếu cần duyệt của APPROVER do bước duyệt ở Sprint 3 bổ sung.
     */
    async get(user, id) {
      const r = isUuid(id) ? await repo.findRequest(id) : null;
      const canSeeAll = ['ADMIN', 'FACILITY_STAFF'].includes(user.role);
      if (!r || (!canSeeAll && r.requesterId !== user.id)) throw notFound();
      return toRequest(r);
    },

    /** Danh sách phiếu: người đăng ký thấy của mình, ADMIN thấy tất cả. Trả { items, total }. */
    async list(user, { status }, paging) {
      const { items, total } = await repo.listRequests({ requesterId: user.role === 'ADMIN' ? undefined : user.id, status, ...paging });
      return { items: items.map(toRequest), total };
    },

    /**
     * Đính kèm tệp (kế hoạch, văn bản của Ban Giám hiệu). Tối đa 5 MB, chỉ nhận PDF, Word, ảnh.
     * Lỗi: FILE_TOO_LARGE (413), UNSUPPORTED_FILE_TYPE (415), INVALID_STATE khi phiếu đã gửi.
     */
    async attach(user, id, file) {
      const r = await owned(user, id);
      if (r.status !== 'DRAFT') throw new ApiError(409, 'INVALID_STATE', 'Chỉ đính kèm được vào yêu cầu đang ở trạng thái nháp.');
      if (!file) throw validation([{ field: 'file', message: 'Chọn tệp đính kèm.' }]);
      if (r.attachments.length >= MAX_ATTACHMENTS) throw validation([{ field: 'file', message: `Mỗi yêu cầu tối đa ${MAX_ATTACHMENTS} tệp đính kèm.` }]);
      if (file.size > MAX_FILE_BYTES) throw new ApiError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn 5 MB.');
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!FILE_EXTENSIONS.includes(ext)) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Chỉ nhận tệp PDF, Word hoặc ảnh.');
      if (!matchesSignature(ext, file.buffer)) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Nội dung tệp không đúng với định dạng của tên tệp.');
      const filePath = await storage.save(file.buffer, ext);
      try {
        await repo.addAttachment(id, { type: 'ATTACHMENT', filePath, fileName: path.basename(file.originalname).slice(0, 255), uploadedBy: user.id });
      } catch (err) {
        // Lưu bản ghi lỗi thì xóa tệp vừa ghi, không để tệp mồ côi trên đĩa.
        await storage.remove(filePath).catch(() => {});
        throw err;
      }
      return toRequest(await repo.findRequest(id));
    },

    /**
     * Gửi yêu cầu: kiểm tra lần lượt các điều kiện của bảng 1.7 (API Contract), điều kiện nào sai thì dừng và
     * phiếu giữ nguyên ở nháp. Hợp lệ thì chuyển PENDING và sinh các bước duyệt trong một giao dịch.
     * Lỗi: LEAD_TIME_VIOLATION, AFTER_HOURS_LIMIT, ROOM_UNAVAILABLE, CAPACITY_EXCEEDED, ATTACHMENT_REQUIRED, ROOM_CONFLICT, INVALID_STATE.
     */
    async submit(user, id) {
      const r = await owned(user, id);
      if (r.status !== 'DRAFT') throw new ApiError(409, 'INVALID_STATE', 'Chỉ gửi được yêu cầu đang ở trạng thái nháp.');
      const now = clock();
      const room = r.room;
      // BR-02: gửi trước giờ sử dụng ít nhất 3 ngày làm việc.
      if (r.startAt < addWorkdays(now, LEAD_WORKDAYS)) throw new ApiError(422, 'LEAD_TIME_VIOLATION', 'Phải gửi yêu cầu trước giờ sử dụng ít nhất 3 ngày làm việc.');
      // BR-09: kết thúc cùng ngày và không muộn hơn 21:30.
      if (!sameDay(r.startAt, r.endAt) || minutesOfDay(r.endAt) > LATEST_END_MINUTES) throw new ApiError(422, 'AFTER_HOURS_LIMIT', 'Thời gian kết thúc không được muộn hơn 21:30 cùng ngày.');
      // BR-08: phòng phải đang AVAILABLE.
      if (room.status !== 'AVAILABLE') throw new ApiError(409, 'ROOM_UNAVAILABLE', `Phòng ${room.code} hiện không khả dụng.`);
      if (r.participantCount > room.capacity) throw new ApiError(422, 'CAPACITY_EXCEEDED', `Số người tham dự vượt sức chứa của phòng ${room.code} (${room.capacity} chỗ).`);
      // BR-05: từ 200 người cần văn bản của Ban Giám hiệu.
      if (r.participantCount >= BGH_THRESHOLD && !r.attachments.length) throw new ApiError(422, 'ATTACHMENT_REQUIRED', 'Hoạt động từ 200 người trở lên cần đính kèm văn bản của Ban Giám hiệu.');
      // BR-10 và BR-01: không giao với buổi học ACTIVE hay lượt đặt ACTIVE.
      const conflicts = await availability.conflictDetails(room.id, r.startAt, r.endAt);
      if (conflicts.length) {
        const what = conflicts[0].source === 'CLASS_SCHEDULE' ? 'lớp học' : 'lượt đặt được duyệt';
        throw new ApiError(409, 'ROOM_CONFLICT', `Phòng ${room.code} đã có ${what} trong khung giờ này.`, conflicts);
      }
      const orgs = await Promise.all(approvalChain(r.participantCount).map((name) => repo.findOrganizationByName(name)));
      if (orgs.some((o) => !o)) throw new ApiError(500, 'INTERNAL_ERROR', 'Chưa cấu hình đơn vị duyệt.');
      const steps = orgs.map((o, i) => ({ stepNo: i + 1, approverOrgId: o.id, status: i === 0 ? 'PENDING' : 'WAITING' }));
      const submitted = await repo.submitRequest(id, steps, now);
      // null nghĩa là có yêu cầu khác gửi hoặc hủy phiếu này trước.
      if (!submitted) throw new ApiError(409, 'INVALID_STATE', 'Yêu cầu đã được gửi hoặc hủy.');
      return toRequest(submitted);
    },

    /** Hủy phiếu nháp hoặc đang chờ duyệt (FR-09). Lỗi: NOT_FOUND, INVALID_STATE. */
    async cancel(user, id, reason) {
      await owned(user, id);
      const text = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : 'Người đăng ký hủy yêu cầu';
      const cancelled = await repo.cancelRequest(id, text, clock());
      if (!cancelled) throw new ApiError(409, 'INVALID_STATE', 'Yêu cầu không còn hủy được.');
      return toRequest(cancelled);
    },
  };
}

module.exports = { createRequestService, toRequest, approvalChain, reqCode, MAX_FILE_BYTES };
