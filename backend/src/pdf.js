const path = require('path');
const PDFDocument = require('pdfkit');
const { parts } = require('./timeVN');

// Phiếu đề xuất sử dụng phòng dạng PDF (FR-15, SCRUM-20). Phông chuẩn của PDF không có dấu tiếng Việt nên dùng Roboto.
const FONT_DIR = path.join(path.dirname(require.resolve('roboto-fontface/package.json')), 'fonts', 'roboto');
const FONT = path.join(FONT_DIR, 'Roboto-Regular.woff');
const FONT_BOLD = path.join(FONT_DIR, 'Roboto-Bold.woff');

const ITEM = { PROJECTOR: 'Máy chiếu', MICROPHONE: 'Micro', AUDIO: 'Âm thanh', AIR_CONDITIONER: 'Máy lạnh', OTHER: 'Khác' };
const STEP = { APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', PENDING: 'Đang chờ', WAITING: 'Chưa tới lượt', CANCELLED: 'Đã hủy' };
const p2 = (n) => String(n).padStart(2, '0');
const at = (iso) => {
  const p = parts(new Date(iso));
  return `${p2(p.h)}:${p2(p.mi)} ${p2(p.d)}/${p2(p.m)}/${p.y}`;
};
const range = (from, to) => {
  const a = parts(new Date(from));
  const b = parts(new Date(to));
  return `${p2(a.h)}:${p2(a.mi)} đến ${p2(b.h)}:${p2(b.mi)} ngày ${p2(a.d)}/${p2(a.m)}/${a.y}`;
};

/** Dựng PDF từ đối tượng request (dạng toRequest). Trả Promise<Buffer>. now là thời điểm in ghi ở cuối phiếu. */
function requestPdf(r, now = new Date()) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 57, bottom: 57, left: 85, right: 57 }, info: { Title: `Phiếu đề xuất sử dụng phòng ${r.code}`, Author: 'Hệ thống quản lý phòng học và thiết bị' } });
  doc.registerFont('r', FONT);
  doc.registerFont('b', FONT_BOLD);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('b').fontSize(12).text('TRƯỜNG ĐẠI HỌC VĂN LANG', { align: 'center' });
  doc.moveDown(0.8).fontSize(16).text('PHIẾU ĐỀ XUẤT SỬ DỤNG PHÒNG', { align: 'center' });
  doc.moveDown(0.2).font('r').fontSize(11).text(`Mã phiếu: ${r.code}`, { align: 'center' });
  doc.moveDown(1.2);

  const row = (label, value) => {
    doc.font('b').fontSize(11).text(`${label}: `, { continued: true }).font('r').text(value || '-');
    doc.moveDown(0.25);
  };
  doc.font('b').fontSize(12).text('1. Thông tin yêu cầu');
  doc.moveDown(0.4);
  row('Đơn vị đăng ký', r.organizationName);
  row('Người đề xuất', r.requesterName);
  row('Phòng', `${r.room.code} - ${r.room.name} (${r.room.capacity} chỗ)`);
  row('Thời gian sử dụng', range(r.startAt, r.endAt));
  row('Số người tham dự', String(r.participantCount));
  row('Mục đích', r.purpose);
  row('Thiết bị đề xuất', r.equipment.length ? r.equipment.map((e) => `${ITEM[e.itemType] || e.itemType}${e.itemType === 'OTHER' && e.otherDescription ? ` (${e.otherDescription})` : ''} x${e.quantity}`).join(', ') : 'Không đề xuất thiết bị');
  row('Tài liệu đính kèm', r.attachments.length ? r.attachments.map((a) => a.fileName).join(', ') : 'Không có');

  doc.moveDown(0.8).font('b').fontSize(12).text('2. Các cấp duyệt');
  doc.moveDown(0.4);
  for (const s of r.steps) {
    const when = s.decidedAt ? ` lúc ${at(s.decidedAt)}` : '';
    const note = s.decisionReason ? `. Ghi chú: ${s.decisionReason}` : '';
    row(`Cấp ${s.order}. ${s.organizationName}`, `${STEP[s.status] || s.status}${when}${note}`);
  }
  row('Kết quả', 'Yêu cầu đã được duyệt hoàn tất, phòng được giữ cho khung giờ trên.');

  doc.moveDown(1.5).font('r').fontSize(9).fillColor('#555555').text(`In lúc ${at(now)} từ Hệ thống quản lý phòng học và thiết bị.`);
  doc.end();
  return done;
}

module.exports = { requestPdf };
