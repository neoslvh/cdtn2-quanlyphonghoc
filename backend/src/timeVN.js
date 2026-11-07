// Giờ Việt Nam (UTC+7, không có giờ mùa hè). Máy chủ chạy UTC nên mọi quy tắc theo giờ trong ngày (21:30, ngày làm việc) tính ở đây.
const OFFSET_MS = 7 * 3600 * 1000;

// Các thành phần ngày giờ theo giờ Việt Nam. dow: 0 là chủ nhật, 6 là thứ bảy.
function parts(date) {
  const x = new Date(date.getTime() + OFFSET_MS);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), dow: x.getUTCDay() };
}

const minutesOfDay = (date) => {
  const p = parts(date);
  return p.h * 60 + p.mi;
};

const sameDay = (a, b) => {
  const p = parts(a);
  const q = parts(b);
  return p.y === q.y && p.m === q.m && p.d === q.d;
};

// Tạo thời điểm từ ngày giờ theo giờ Việt Nam.
const fromVN = (y, m, d, h = 0, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi) - OFFSET_MS);

// Cộng n ngày làm việc (thứ hai đến thứ sáu) vào thời điểm date, giữ nguyên giờ trong ngày.
function addWorkdays(date, n) {
  let x = date;
  for (let count = 0; count < n; ) {
    x = new Date(x.getTime() + 24 * 3600 * 1000);
    const { dow } = parts(x);
    if (dow !== 0 && dow !== 6) count++;
  }
  return x;
}

// Thời điểm kết thúc muộn nhất trong ngày (BR-09).
const LATEST_END_MINUTES = 21 * 60 + 30;

module.exports = { parts, minutesOfDay, sameDay, fromVN, addWorkdays, LATEST_END_MINUTES };
