const path = require('path');
const { ApiError } = require('../errors');
const { isUuid, validation } = require('../http');
const { qrSvg, tokenOf } = require('../qr');
const { matchesSignature, reqCode, toRequest } = require('./requestService');

// Tầng service: mã QR (FR-05, SCRUM-10), check-in (FR-18, SCRUM-23), báo hỏng (FR-19, SCRUM-24).

// Check-in sớm nhất 15 phút trước giờ bắt đầu để kịp nhận phòng, muộn nhất đến giờ kết thúc.
const CHECKIN_EARLY_MS = 15 * 60 * 1000;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const MAX_DESCRIPTION = 2000;
const INCIDENT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

const toEquipment = (e) => ({ id: e.id, assetCode: e.assetCode, name: e.name, equipmentType: e.equipmentType, status: e.status, qrToken: e.qrToken, room: e.room ? { id: e.room.id, code: e.room.code } : null });
const toQrRoom = (r) => ({ id: r.id, code: r.code, name: r.name, roomType: r.roomType, capacity: r.capacity, status: r.status });
const toIncident = (i) => ({
  id: i.id,
  createdAt: i.createdAt.toISOString(),
  description: i.description,
  imageName: i.imageName || null,
  status: i.status,
  reporterName: i.reporter.fullName,
  request: { id: i.request.id, code: reqCode(i.request.requestNo) },
  room: { code: i.request.room.code },
  equipment: { id: i.equipment.id, assetCode: i.equipment.assetCode, name: i.equipment.name },
  // Phiếu bảo trì do SCRUM-25 bổ sung.
  ticket: null,
});

const invalid = (message) => new ApiError(409, 'INVALID_STATE', message);
const notFound = (what) => new ApiError(404, 'NOT_FOUND', `Không tìm thấy ${what}.`);
const fmtTime = (d) => d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

function createFacilityService({ repo, storage, clock = () => new Date() }) {
  // Phiếu của chính người đăng ký. Phiếu của người khác báo không tìm thấy để không lộ phiếu tồn tại.
  async function owned(user, id) {
    const r = isUuid(id) ? await repo.findRequest(id) : null;
    if (!r || r.requesterId !== user.id) throw notFound('yêu cầu');
    return r;
  }

  return {
    /** Ảnh QR của phòng, nội dung là đường dẫn {base}/qr/{token} để quét bằng camera là mở trang thông tin. */
    async roomQr(id, base) {
      const r = isUuid(id) ? await repo.findRoomQr(id) : null;
      if (!r) throw notFound('phòng');
      return qrSvg(`${base}/qr/${encodeURIComponent(r.qrToken)}`, r.code, r.qrToken);
    },

    async equipmentQr(id, base) {
      const e = isUuid(id) ? await repo.findEquipment(id) : null;
      if (!e) throw notFound('thiết bị');
      return qrSvg(`${base}/qr/${encodeURIComponent(e.qrToken)}`, e.assetCode, e.qrToken);
    },

    /** Thông tin tài nguyên ứng với mã QR, kể cả khi phòng ngừng sử dụng hay thiết bị hỏng (trạng thái trả đúng như hiện tại). */
    async resolveQr(raw) {
      const token = tokenOf(raw);
      const t = token ? await repo.findQrTarget(token) : null;
      if (!t) throw notFound('mã QR');
      return t.type === 'ROOM' ? { type: 'ROOM', room: toQrRoom(t.room) } : { type: 'EQUIPMENT', equipment: toEquipment(t.equipment) };
    },

    /** Thiết bị của một phòng, cho ô chọn thiết bị khi báo hỏng. */
    async roomEquipment(roomId) {
      return (await repo.listRoomEquipment(roomId)).map(toEquipment);
    },

    /**
     * Check-in bằng mã QR dán tại phòng. Chỉ phiếu đã duyệt của chính người đăng ký, đúng phòng, trong khung giờ
     * từ 15 phút trước giờ bắt đầu đến giờ kết thúc, mỗi phiếu một lần.
     * Lỗi: VALIDATION_ERROR, NOT_FOUND, INVALID_STATE (kèm lý do sai phòng, sai giờ, đã check-in).
     */
    async checkin(user, id, body) {
      const token = tokenOf((body || {}).qrToken);
      if (!token) throw validation([{ field: 'qrToken', message: 'Quét hoặc nhập mã QR dán tại phòng.' }]);
      const r = await owned(user, id);
      if (r.status !== 'APPROVED') throw invalid('Chỉ check-in được yêu cầu đã duyệt.');
      if (r.checkin) throw invalid('Yêu cầu này đã check-in.');
      const t = await repo.findQrTarget(token);
      if (!t || t.type !== 'ROOM' || t.room.id !== r.room.id) throw invalid(`Mã QR không phải của phòng ${r.room.code}.`);
      const now = clock();
      if (now.getTime() < r.startAt.getTime() - CHECKIN_EARLY_MS || now > r.endAt) {
        throw invalid(`Chỉ check-in được từ ${fmtTime(new Date(r.startAt.getTime() - CHECKIN_EARLY_MS))} đến ${fmtTime(r.endAt)}.`);
      }
      if (!(await repo.createCheckin({ requestId: r.id, userId: user.id, roomId: r.room.id, now }))) throw invalid('Yêu cầu này đã check-in.');
      return toRequest(await repo.findRequest(r.id));
    },

    /**
     * Báo hỏng thiết bị trong phòng của phiếu đã duyệt, trong thời gian dùng phòng: mô tả bắt buộc, ảnh PNG hoặc JPG
     * tùy chọn (tối đa 5 MB). Chỉ thiết bị đang Tốt; thiết bị chuyển BROKEN.
     * Lỗi: VALIDATION_ERROR, NOT_FOUND, INVALID_STATE, UNSUPPORTED_FILE_TYPE.
     */
    async reportIncident(user, body, file) {
      const b = body || {};
      const description = typeof b.description === 'string' ? b.description.trim() : '';
      const details = [];
      if (!isUuid(b.requestId)) details.push({ field: 'requestId', message: 'Chọn yêu cầu đang sử dụng phòng.' });
      if (!isUuid(b.equipmentId)) details.push({ field: 'equipmentId', message: 'Chọn thiết bị bị hỏng.' });
      if (!description) details.push({ field: 'description', message: 'Mô tả tình trạng hỏng.' });
      else if (description.length > MAX_DESCRIPTION) details.push({ field: 'description', message: `Mô tả tối đa ${MAX_DESCRIPTION} ký tự.` });
      if (details.length) throw validation(details);
      let ext = '';
      if (file) {
        ext = path.extname(file.originalname || '').toLowerCase();
        if (!IMAGE_EXTENSIONS.includes(ext) || !matchesSignature(ext, file.buffer)) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Ảnh minh chứng chỉ nhận PNG hoặc JPG.');
      }
      const r = await owned(user, b.requestId);
      if (r.status !== 'APPROVED') throw invalid('Chỉ báo hỏng trong yêu cầu đã duyệt.');
      // Báo hỏng trong thời gian dùng phòng, cùng khung giờ với check-in.
      const now = clock();
      if (now.getTime() < r.startAt.getTime() - CHECKIN_EARLY_MS || now > r.endAt) {
        throw invalid(`Chỉ báo hỏng được trong thời gian sử dụng phòng, từ ${fmtTime(new Date(r.startAt.getTime() - CHECKIN_EARLY_MS))} đến ${fmtTime(r.endAt)}.`);
      }
      const e = await repo.findEquipment(b.equipmentId);
      if (!e || !e.room || e.room.id !== r.room.id) throw validation([{ field: 'equipmentId', message: `Thiết bị không thuộc phòng ${r.room.code}.` }]);
      // Thiết bị đã báo hỏng hoặc đang bảo trì thì không báo lại, tránh báo trùng và đổi sai trạng thái bảo trì.
      if (e.status !== 'GOOD') throw invalid(e.status === 'BROKEN' ? `Thiết bị ${e.assetCode} đã được báo hỏng và đang chờ xử lý.` : `Thiết bị ${e.assetCode} đang bảo trì.`);
      const imagePath = file ? await storage.save(file.buffer, ext) : null;
      try {
        const i = await repo.createIncident({ requestId: r.id, equipmentId: e.id, reportedBy: user.id, description, imagePath, imageName: file ? path.basename(file.originalname).slice(0, 255) : null });
        // null: thiết bị vừa bị người khác báo hỏng giữa lúc kiểm tra và lúc ghi.
        if (!i) throw invalid(`Thiết bị ${e.assetCode} đã được báo hỏng và đang chờ xử lý.`);
        return toIncident(i);
      } catch (err) {
        if (imagePath && storage.remove) await storage.remove(imagePath);
        throw err;
      }
    },

    /** Danh sách báo hỏng cho nhân viên cơ sở vật chất. Lỗi: VALIDATION_ERROR khi trạng thái lọc sai. */
    async listIncidents({ status }, paging) {
      if (status && !INCIDENT_STATUSES.includes(status)) throw validation([{ field: 'status', message: 'Trạng thái không hợp lệ.' }]);
      const { items, total } = await repo.listIncidents({ status, ...paging });
      return { items: items.map(toIncident), total };
    },
  };
}

module.exports = { createFacilityService, toEquipment };
