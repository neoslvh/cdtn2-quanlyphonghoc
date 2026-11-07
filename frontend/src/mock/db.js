import dayjs from 'dayjs';

// Dữ liệu giả trong bộ nhớ, mất khi tải lại trang. Hình dạng theo API Contract v1.0 và ERD v4.1.
export const rooms = [
  { id: 'room-a1001', code: 'A.10.01', name: 'Phòng A.10.01', campus: 'Cơ sở 1', roomType: 'CLASSROOM', capacity: 80, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 2, MICROPHONE: 2 } },
  { id: 'room-a1002', code: 'A.10.02', name: 'Phòng A.10.02', campus: 'Cơ sở 1', roomType: 'CLASSROOM', capacity: 100, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 4, MICROPHONE: 2, AUDIO: 1 } },
  { id: 'room-b0504', code: 'B.05.04', name: 'Phòng B.05.04', campus: 'Cơ sở 1', roomType: 'CLASSROOM', capacity: 45, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 2 } },
  { id: 'room-b0601', code: 'B.06.01', name: 'Phòng máy B.06.01', campus: 'Cơ sở 1', roomType: 'LAB', capacity: 60, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 3 } },
  { id: 'room-b0602', code: 'B.06.02', name: 'Phòng máy B.06.02', campus: 'Cơ sở 1', roomType: 'LAB', capacity: 40, status: 'MAINTENANCE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 2 } },
  { id: 'room-c0301', code: 'C.03.01', name: 'Hội trường C.03.01', campus: 'Cơ sở 2', roomType: 'HALL', capacity: 250, status: 'AVAILABLE', equipment: { PROJECTOR: 2, AIR_CONDITIONER: 6, MICROPHONE: 6, AUDIO: 2 } },
  { id: 'room-c0302', code: 'C.03.02', name: 'Phòng C.03.02', campus: 'Cơ sở 2', roomType: 'CLASSROOM', capacity: 60, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 2, MICROPHONE: 1 } },
  { id: 'room-d0201', code: 'D.02.01', name: 'Phòng D.02.01', campus: 'Cơ sở 3', roomType: 'CLASSROOM', capacity: 90, status: 'AVAILABLE', equipment: { PROJECTOR: 1, AIR_CONDITIONER: 3, MICROPHONE: 2 } },
  { id: 'room-d0301', code: 'D.03.01', name: 'Hội trường D.03.01', campus: 'Cơ sở 3', roomType: 'HALL', capacity: 300, status: 'AVAILABLE', equipment: { PROJECTOR: 2, AIR_CONDITIONER: 8, MICROPHONE: 8, AUDIO: 2 } },
];

// Bảng khung tiết (period_slot): tiết 1 đến 6 buổi sáng, tiết 7 đến 12 buổi chiều, mỗi tiết 45 phút.
export const periodSlots = Array.from({ length: 12 }, (_, i) => {
  const base = i < 6 ? 7 * 60 : 13 * 60;
  const offset = (i % 6) * 45;
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { period: i + 1, startTime: fmt(base + offset), endTime: fmt(base + offset + 45) };
});

export const sessionTime = (date, period, count) => {
  const [sh, sm] = periodSlots[period - 1].startTime.split(':').map(Number);
  const [eh, em] = periodSlots[period + count - 2].endTime.split(':').map(Number);
  const d = dayjs(date);
  return { startAt: d.hour(sh).minute(sm).second(0).format(), endAt: d.hour(eh).minute(em).second(0).format() };
};

// Mỗi tuần một buổi giữa hai ngày, ngày trong tuần theo thứ 2 đến 8 của thời khóa biểu (8 là chủ nhật).
export function expandSessions({ weekday, period, count, roomCode, courseCode, courseName, classCode, from, to, semester }, nextId) {
  const target = weekday === 8 ? 0 : weekday - 1;
  const out = [];
  for (let d = dayjs(from); !d.isAfter(to, 'day'); d = d.add(1, 'day')) {
    if (d.day() !== target) continue;
    out.push({ id: nextId(), semester, roomCode, courseCode, courseName, classCode, status: 'ACTIVE', ...sessionTime(d, period, count) });
  }
  return out;
}

let seq = 0;
export const nextId = (prefix = 'id') => `${prefix}-${++seq}`;

const seed = [
  { weekday: 2, period: 1, count: 3, roomCode: 'A.10.01', courseCode: 'IT001', courseName: 'Lập trình Web', classCode: 'K29-SE01' },
  { weekday: 3, period: 1, count: 3, roomCode: 'A.10.02', courseCode: 'IT003', courseName: 'Cơ sở dữ liệu', classCode: 'K29-SE02' },
  { weekday: 4, period: 7, count: 3, roomCode: 'B.05.04', courseCode: 'SE101', courseName: 'Nhập môn công nghệ phần mềm', classCode: 'K30-SE01' },
  { weekday: 5, period: 1, count: 4, roomCode: 'B.06.01', courseCode: 'IT010', courseName: 'Thực hành mạng máy tính', classCode: 'K29-NW01' },
  { weekday: 6, period: 7, count: 3, roomCode: 'C.03.02', courseCode: 'EN201', courseName: 'Tiếng Anh chuyên ngành', classCode: 'K28-EN02' },
  { weekday: 2, period: 7, count: 3, roomCode: 'D.02.01', courseCode: 'EC110', courseName: 'Kinh tế vi mô', classCode: 'K30-EC01' },
];

export const SEMESTER = 'HK1 2026-2027';
export const classSessions = seed.flatMap((s) =>
  expandSessions({ ...s, semester: SEMESTER, from: '2026-09-14', to: '2026-12-27' }, () => nextId('ses')),
);
export const importBatches = [];
export const requests = [];
