const QRCode = require('qrcode');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Ảnh SVG của mã QR chứa text, bên dưới in nhãn (mã phòng hoặc mã tài sản) và mã token để nhập tay khi
 * trình duyệt không quét được (FR-05). SVG in ra giấy không bị vỡ hình ở mọi cỡ tem.
 */
function qrSvg(text, label, token) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const cell = 8;
  const quiet = 4;
  const w = (n + quiet * 2) * cell;
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (modules.get(y, x)) d += `M${(x + quiet) * cell} ${(y + quiet) * cell}h${cell}v${cell}h-${cell}z`;
  }
  const h = w + 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/><path d="${d}" fill="#000"/><text x="${w / 2}" y="${w}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">${esc(label)}</text><text x="${w / 2}" y="${w + 24}" font-family="monospace" font-size="11" text-anchor="middle" fill="#555">${esc(token)}</text></svg>`;
}

/** Lấy token từ nội dung quét được: chấp nhận cả đường dẫn .../qr/{token} lẫn token nhập tay. */
function tokenOf(raw) {
  const v = String(raw || '').trim();
  const m = /\/qr\/([^/?#]+)\/?(?:[?#].*)?$/.exec(v);
  if (!m) return v;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

module.exports = { qrSvg, tokenOf };
