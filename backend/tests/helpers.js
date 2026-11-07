const jwt = require('jsonwebtoken');

const SECRET = 'khoa-bi-mat-chi-dung-khi-kiem-thu';

const ORGS = [
  { id: 'org-cntt', name: 'Khoa Công nghệ thông tin', type: 'REQUESTER_UNIT', active: true },
  { id: 'org-pdt', name: 'Phòng Đào tạo', type: 'APPROVAL_UNIT', active: true },
  { id: 'org-bgh', name: 'Ban Giám hiệu', type: 'APPROVAL_UNIT', active: true },
  { id: 'org-csvc', name: 'Phòng Quản trị cơ sở vật chất', type: 'FACILITY_UNIT', active: true },
];

// Cơ sở dữ liệu giả trong bộ nhớ, cùng giao diện với src/prismaDb.js. Mỗi nhóm hàm được thêm dần theo từng API.
function fakeDb() {
  const users = [];
  const buildings = [{ id: 'b-a', code: 'A', name: 'Tòa A', campus: 'Cơ sở 1' }];
  const rooms = [];
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
    countRooms: async () => rooms.length,
    findOrganization: async (oid) => ORGS.find((o) => o.id === oid) || null,
    listOrganizations: async () => ORGS,
    findUserById: async (uid) => {
      const u = users.find((x) => x.id === uid);
      return u ? { ...u, organization: ORGS.find((o) => o.id === u.organizationId) } : null;
    },
    findUserByEmail: async (email) => users.find((u) => u.email === email) || null,
    // phòng
    listRooms: async ({ campus, roomType, status, q }) =>
      rooms
        .map(flat)
        .filter((r) => (!campus || r.campus === campus) && (!roomType || r.roomType === roomType) && (!status || r.status === status))
        .filter((r) => !q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.code.localeCompare(b.code)),
    findRoom: async (rid) => (rooms.find((r) => r.id === rid) ? flat(rooms.find((r) => r.id === rid)) : null),
    findRoomByCode: async (code) => rooms.find((r) => r.code === code) || null,
    findBuildingByCode: async (code) => buildings.find((b) => b.code === code) || null,
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

module.exports = { fakeDb, login, ORGS, SECRET };
