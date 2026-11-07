const jwt = require('jsonwebtoken');

const SECRET = 'khoa-bi-mat-chi-dung-khi-kiem-thu';

const ORGS = [
  { id: 'org-cntt', name: 'Khoa Công nghệ thông tin', type: 'REQUESTER_UNIT', active: true },
  { id: 'org-pdt', name: 'Phòng Đào tạo', type: 'APPROVAL_UNIT', active: true },
  { id: 'org-bgh', name: 'Ban Giám hiệu', type: 'APPROVAL_UNIT', active: true },
  { id: 'org-csvc', name: 'Phòng Quản trị cơ sở vật chất', type: 'FACILITY_UNIT', active: true },
];

// Cơ sở dữ liệu giả trong bộ nhớ, cùng giao diện với các repository trong src/repositories. Mỗi nhóm hàm được thêm dần theo từng API.
function fakeDb() {
  const users = [];
  const buildings = [{ id: 'b-a', code: 'A', name: 'Tòa A', campus: 'Cơ sở 1' }];
  const rooms = [];
  const sessions = [];
  const bookings = [];
  const overlaps = (x, from, to) => x.startAt < to && from < x.endAt;
  let seq = 0;
  const id = (p) => `${p}-${++seq}`;
  const flat = (r) => {
    const b = buildings.find((x) => x.id === r.buildingId);
    return { ...r, buildingCode: b.code, buildingName: b.name, campus: b.campus };
  };
  return {
    users,
    buildings,
    rooms,
    sessions,
    bookings,
    countRooms: async () => rooms.length,
    findOrganization: async (oid) => ORGS.find((o) => o.id === oid) || null,
    listOrganizations: async () => ORGS,
    findUserById: async (uid) => {
      const u = users.find((x) => x.id === uid);
      return u ? { ...u, organization: ORGS.find((o) => o.id === u.organizationId) } : null;
    },
    findUserByEmail: async (email) => users.find((u) => u.email === email) || null,
    // trùng lịch
    busyRoomIds: async (from, to) =>
      new Set([...sessions.filter((x) => x.status === 'ACTIVE' && overlaps(x, from, to)), ...bookings.filter((x) => x.status === 'ACTIVE' && overlaps(x, from, to))].map((x) => x.roomId)),
    findRoomConflict: async (roomId, from, to, { excludeRequestId } = {}) => {
      const s = sessions.find((x) => x.roomId === roomId && x.status === 'ACTIVE' && overlaps(x, from, to));
      if (s) return { source: 'CLASS_SCHEDULE', courseCode: s.courseCode, classCode: s.classCode };
      const b = bookings.find((x) => x.roomId === roomId && x.status === 'ACTIVE' && overlaps(x, from, to) && (!excludeRequestId || x.requestId !== excludeRequestId));
      return b ? { source: 'ROOM_BOOKING', requestNo: b.requestNo } : null;
    },
    // phòng
    listRooms: async ({ campus, roomType, status, q, minCapacity, page, pageSize }) => {
      const all = rooms
        .map(flat)
        .filter((r) => (!campus || r.campus === campus) && (!roomType || r.roomType === roomType) && (!status || r.status === status) && (!minCapacity || r.capacity >= minCapacity))
        .filter((r) => !q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.code.localeCompare(b.code));
      return { items: page ? all.slice((page - 1) * pageSize, page * pageSize) : all, total: all.length };
    },
    findRoom: async (rid) => (rooms.find((r) => r.id === rid) ? flat(rooms.find((r) => r.id === rid)) : null),
    findRoomByCode: async (code) => rooms.find((r) => r.code === code) || null,
    findBuildingByCode: async (code) => buildings.find((b) => b.code === code) || null,
    setBuildingCampus: async (bid, campus) => {
      const b = buildings.find((x) => x.id === bid);
      b.campus = campus;
      return b;
    },
    createBuilding: async (data) => {
      const b = { id: id('b'), ...data };
      buildings.push(b);
      return b;
    },
    createRoom: async (data) => {
      const r = { id: '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0'), equipment: {}, ...data };
      rooms.push(r);
      return flat(r);
    },
    updateRoom: async (rid, data) => {
      const r = rooms.find((x) => x.id === rid);
      Object.assign(r, data);
      return flat(r);
    },
  };
}

// Tạo người dùng giả và token đăng nhập của họ.
function login(db, role, orgId = 'org-cntt') {
  const user = { id: `u-${db.users.length + 1}`, fullName: `Người ${role}`, email: `${role.toLowerCase()}${db.users.length}@vlu.edu.vn`, role, status: 'ACTIVE', organizationId: orgId, mustChangePassword: false };
  db.users.push(user);
  return { user, auth: { Authorization: `Bearer ${jwt.sign({ sub: user.id, role }, SECRET, { expiresIn: '1h' })}` } };
}

// Thêm nhanh một phòng vào cơ sở dữ liệu giả (tòa A, cơ sở 1) với thiết bị tốt theo loại.
function addRoom(db, over = {}) {
  const n = db.rooms.length + 1;
  const room = { id: `00000000-0000-4000-8000-${String(900 + n).padStart(12, '0')}`, buildingId: 'b-a', code: `A.10.${String(n).padStart(2, '0')}`, name: `Phòng ${n}`, roomType: 'CLASSROOM', capacity: 80, status: 'AVAILABLE', equipment: {}, ...over };
  db.rooms.push(room);
  return room;
}

module.exports = { fakeDb, login, addRoom, ORGS, SECRET };
