const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');

const ORG = { id: 'org-1', name: 'Khoa Công nghệ thông tin', type: 'REQUESTER_UNIT', active: true };
const APPROVAL_ORG = { id: 'org-2', name: 'Phòng Đào tạo', type: 'APPROVAL_UNIT', active: true };

function fakeDb() {
  const orgs = [ORG, APPROVAL_ORG];
  const users = [];
  const withOrg = (u) => u && { ...u, organization: orgs.find((o) => o.id === u.organizationId) };
  return {
    users,
    countRooms: async () => 0,
    listOrganizations: async ({ all }) => orgs.filter((o) => o.active && (all || o.type === 'REQUESTER_UNIT')),
    findOrganization: async (id) => orgs.find((o) => o.id === id) || null,
    findUserByEmail: async (email) => withOrg(users.find((u) => u.email === email)) || null,
    findUserById: async (id) => withOrg(users.find((u) => u.id === id)) || null,
    createUser: async (data) => {
      const u = { id: `u-${users.length + 1}`, mustChangePassword: false, ...data };
      users.push(u);
      return u;
    },
    listUsers: async () => users.map(withOrg),
    updateUser: async (id, data) => {
      const u = users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, data);
      return withOrg(u);
    },
  };
}

// Đăng ký tự do đóng (mặc định), tài khoản do ADMIN cấp.
async function setup() {
  const db = fakeDb();
  const app = createApp({ db, bcryptRounds: 4 });
  const addUser = async (over) =>
    db.createUser({
      organizationId: ORG.id,
      fullName: 'Nguyễn Văn A',
      email: 'a@vlu.edu.vn',
      passwordHash: await bcrypt.hash('Matkhau123', 4),
      role: 'REQUESTER',
      status: 'ACTIVE',
      ...over,
    });
  const login = (email, password = 'Matkhau123') => request(app).post('/api/auth/login').send({ email, password });
  await addUser({ email: 'admin@vlu.edu.vn', role: 'ADMIN' });
  const token = (await login('admin@vlu.edu.vn')).body.token;
  return { db, app, addUser, login, token };
}

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const newUser = { fullName: ' Phạm Văn D ', email: 'D@vlu.edu.vn', organizationId: APPROVAL_ORG.id, role: 'APPROVER' };

test('mặc định đóng đăng ký tự do', async () => {
  const { app } = await setup();
  const body = { fullName: 'Trần B', email: 'b@vlu.edu.vn', password: 'Matkhau123', organizationId: ORG.id };
  expect((await request(app).post('/api/auth/register').send(body)).status).toBe(404);
  expect((await request(app).get('/api/organizations')).status).toBe(401);
  expect((await request(app).get('/api/auth/config')).body).toEqual({ selfRegistration: false });
});

test('admin tạo tài khoản: ACTIVE, mật khẩu tạm đạt quy tắc, đăng nhập được và bị bắt đổi mật khẩu', async () => {
  const { app, token, login } = await setup();
  const res = await request(app).post('/api/users').set(bearer(token)).send(newUser);
  expect(res.status).toBe(201);
  expect(res.body.user).toMatchObject({ email: 'd@vlu.edu.vn', fullName: 'Phạm Văn D', role: 'APPROVER', status: 'ACTIVE', mustChangePassword: true, organization: { id: APPROVAL_ORG.id } });
  expect(res.body.temporaryPassword).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{12}$/);
  expect(JSON.stringify(res.body.user)).not.toMatch(/hash/i);
  const l = await login('d@vlu.edu.vn', res.body.temporaryPassword);
  expect(l.status).toBe(200);
  expect(l.body.user.mustChangePassword).toBe(true);
});

test('tạo tài khoản: chỉ ADMIN, kiểm tra dữ liệu, chống trùng email', async () => {
  const { app, token, addUser, login } = await setup();
  await addUser({ email: 'u@vlu.edu.vn' });
  const user = (await login('u@vlu.edu.vn')).body.token;
  expect((await request(app).post('/api/users').set(bearer(user)).send(newUser)).status).toBe(403);
  expect((await request(app).post('/api/users').send(newUser)).status).toBe(401);
  const bad = await request(app).post('/api/users').set(bearer(token)).send({ fullName: 'A', email: 'x', role: 'ROOT', organizationId: '' });
  expect(bad.body.error.details.map((d) => d.field).sort()).toEqual(['email', 'fullName', 'organizationId', 'role']);
  expect((await request(app).post('/api/users').set(bearer(token)).send({ ...newUser, organizationId: 'khong-co' })).status).toBe(400);
  await request(app).post('/api/users').set(bearer(token)).send(newUser);
  expect((await request(app).post('/api/users').set(bearer(token)).send(newUser)).status).toBe(409);
});

test('tài khoản bị bắt đổi mật khẩu chỉ gọi được me, logout và change-password', async () => {
  const { app, token, login } = await setup();
  const { temporaryPassword } = (await request(app).post('/api/users').set(bearer(token)).send(newUser)).body;
  const t = (await login('d@vlu.edu.vn', temporaryPassword)).body.token;
  expect((await request(app).get('/api/auth/me').set(bearer(t))).status).toBe(200);
  const blocked = await request(app).get('/api/users').set(bearer(t));
  expect(blocked.status).toBe(403);
  expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  expect((await request(app).post('/api/auth/logout').set(bearer(t))).status).toBe(204);
});

test('đổi mật khẩu: từ chối sai mật khẩu cũ, mật khẩu yếu, trùng mật khẩu cũ; thành công thì gỡ cờ và dùng mật khẩu mới', async () => {
  const { app, token, login } = await setup();
  const { temporaryPassword } = (await request(app).post('/api/users').set(bearer(token)).send(newUser)).body;
  const t = (await login('d@vlu.edu.vn', temporaryPassword)).body.token;
  const change = (body) => request(app).post('/api/auth/change-password').set(bearer(t)).send(body);
  expect((await change({ currentPassword: 'sai-roi-nhe1', newPassword: 'MatKhauMoi99' })).status).toBe(400);
  expect((await change({ currentPassword: temporaryPassword, newPassword: 'ngan' })).status).toBe(400);
  expect((await change({ currentPassword: temporaryPassword, newPassword: temporaryPassword })).status).toBe(400);
  const ok = await change({ currentPassword: temporaryPassword, newPassword: 'MatKhauMoi99' });
  expect(ok.status).toBe(200);
  expect(ok.body.user.mustChangePassword).toBe(false);
  expect((await request(app).get('/api/organizations?scope=all').set(bearer(t))).status).toBe(200); // hết bị chặn
  expect((await login('d@vlu.edu.vn', temporaryPassword)).status).toBe(401);
  expect((await login('d@vlu.edu.vn', 'MatKhauMoi99')).body.user.mustChangePassword).toBe(false);
});

test('admin đặt lại mật khẩu: mật khẩu cũ mất hiệu lực, người dùng bị bắt đổi lại', async () => {
  const { app, token, addUser, login } = await setup();
  const u = await addUser({ email: 'u@vlu.edu.vn' });
  const res = await request(app).patch(`/api/users/${u.id}`).set(bearer(token)).send({ resetPassword: true });
  expect(res.status).toBe(200);
  expect(res.body.user.mustChangePassword).toBe(true);
  expect((await login('u@vlu.edu.vn')).status).toBe(401);
  expect((await login('u@vlu.edu.vn', res.body.temporaryPassword)).body.user.mustChangePassword).toBe(true);
});

test('admin tự đặt lại mật khẩu và sửa tên được, nhưng không tự khóa hoặc đổi vai trò mình', async () => {
  const { app, db, token } = await setup();
  const self = db.users[0].id;
  expect((await request(app).patch(`/api/users/${self}`).set(bearer(token)).send({ fullName: 'Tên Mới' })).body.user.fullName).toBe('Tên Mới');
  expect((await request(app).patch(`/api/users/${self}`).set(bearer(token)).send({ status: 'LOCKED' })).status).toBe(409);
  expect((await request(app).patch(`/api/users/${self}`).set(bearer(token)).send({ resetPassword: true })).status).toBe(200);
});

test('GET /api/organizations?scope=all trả mọi đơn vị cho người đã đăng nhập', async () => {
  const { app, token } = await setup();
  const res = await request(app).get('/api/organizations?scope=all').set(bearer(token));
  expect(res.body.items.map((o) => o.id).sort()).toEqual([ORG.id, APPROVAL_ORG.id]);
});
