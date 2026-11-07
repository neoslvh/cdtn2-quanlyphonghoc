const path = require('path');
const ExcelJS = require('exceljs');
const { ApiError } = require('./errors');

// Đọc tệp thời khóa biểu (CSV hoặc Excel) thành bảng ô chữ. Chỉ đọc cấu trúc, mọi kiểm tra nội dung nằm ở validators/schedule.js.
const MAX_ROWS = 5000;

const pad = (n) => String(n).padStart(2, '0');

// Ô Excel có thể là chuỗi, số, ngày, công thức hay văn bản giàu định dạng; đổi về chuỗi mà người dùng thấy.
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result);
    if ('richText' in value) return value.richText.map((t) => t.text).join('').trim();
    if ('text' in value) return String(value.text).trim();
    return '';
  }
  return String(value).trim();
}

/** CSV có dấu ngoặc kép và dấu phẩy hoặc chấm phẩy làm ngăn cách, bỏ BOM đầu tệp. */
function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/**
 * Đọc tệp thành mảng dòng, mỗi dòng là mảng chuỗi (dòng đầu là tiêu đề).
 * Nhận: file { originalname, buffer }.
 * Lỗi: UNSUPPORTED_FILE_TYPE (415) khi không phải CSV hoặc Excel .xlsx, IMPORT_INVALID khi không đọc được tệp hoặc quá nhiều dòng.
 */
async function readRows(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  let rows;
  if (ext === '.csv') {
    rows = parseCsv(file.buffer.toString('utf8'));
  } else if (ext === '.xlsx') {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file.buffer);
      const sheet = wb.worksheets[0];
      rows = [];
      sheet.eachRow({ includeEmpty: false }, (r) => {
        const cells = [];
        for (let i = 1; i <= 10; i++) cells.push(cellText(r.getCell(i).value));
        if (cells.some((c) => c !== '')) rows.push(cells);
      });
    } catch {
      throw new ApiError(422, 'IMPORT_INVALID', 'Không đọc được tệp Excel. Hãy dùng tệp mẫu và lưu dạng .xlsx.', [{ row: 1, column: '', message: 'Tệp Excel không đọc được hoặc bị hỏng.' }]);
    }
  } else {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Chỉ nhận tệp CSV hoặc Excel (.xlsx).');
  }
  if (rows.length > MAX_ROWS + 1) {
    throw new ApiError(422, 'IMPORT_INVALID', `Tệp có quá nhiều dòng, tối đa ${MAX_ROWS} dòng.`, [{ row: MAX_ROWS + 2, column: '', message: `Tối đa ${MAX_ROWS} dòng dữ liệu.` }]);
  }
  return rows;
}

module.exports = { readRows, parseCsv, MAX_ROWS };
