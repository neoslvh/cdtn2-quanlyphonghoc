const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { createLoginLimiter } = require('../src/auth');

const ORG = { id: 'org-1', name: 'Khoa Công nghệ thông tin', type: 'REQUESTER_UNIT', active: true };
const APPROVAL_ORG = { id: 'org-2', name: 'Phòng Đào tạo', type: 'APPROVAL_UNIT', active: true };

// Cơ sở dữ liệu giả trong bộ nhớ, cùng giao diện với adapter Prisma ở server.js.
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
      const u = { id: `u-${users.length + 1}`, ...data };
      users.push(u);
      return u;
    },
    listUsers: async ({ status }) => users.filter((u) => !status || u.status === status).map(withOrg),
    updateUser: async (id, data) => {
      const u = users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, data);
      return withOrg(u);
    },
  };
}

function setup(limiter, allowRegistration = true) {
  const db = fakeDb();
  const app = createApp({ db, bcryptRounds: 4, limiter, allowRegistration });
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
  const login = async (email = 'a@vlu.edu.vn', password = 'Matkhau123') => request(app).post('/api/auth/login').send({ email, password });
  return { db, app, addUser, login };
}

const validRegister = { fullName: 'Trần Thị B', email: 'B@VLU.edu.vn ', password: 'Matkhau123', organizationId: ORG.id };

describe('đăng ký', () => {
  test('tạo tài khoản REQUESTER ở trạng thái PENDING, chuẩn hóa email, không lộ mật khẩu', async () => {
    const { app, db } = setup();
    const res = await request(app).post('/api/auth/register').send(validRegister);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'b@vlu.edu.vn', role: 'REQUESTER', status: 'PENDING', organization: { id: ORG.id } });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|"password"|Matkhau123/);
    expect(db.users[0].passwordHash).not.toBe('Matkhau123');
  });

  test('bỏ qua role và status do client gửi lên', async () => {
    const { app, db } = setup();
    await request(app).post('/api/auth/register').send({ ...validRegister, role: 'ADMIN', status: 'ACTIVE' });
    expect(db.users[0]).toMatchObject({ role: 'REQUESTER', status: 'PENDING' });
  });

  test('báo từng trường sai khi dữ liệu không hợp lệ', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/auth/register').send({ fullName: 'A', email: 'khong-phai-email', password: 'abc', organizationId: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['email', 'fullName', 'organizationId', 'password']);
  });

  test('từ chối mật khẩu chỉ có chữ hoặc chỉ có số', async () => {
    const { app } = setup();
    for (const password of ['chuchuchuchu', '1234567890']) {
      const res = await request(app).post('/api/auth/register').send({ ...validRegister, password });
      expect(res.status).toBe(400);
    }
  });

  test('từ chối email đã đăng ký, không phân biệt hoa thường', async () => {
    const { app, addUser } = setup();
    await addUser({ email: 'b@vlu.edu.vn' });
    const res = await request(app).post('/api/auth/register').send(validRegister);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });

  test('từ chối đơn vị không thuộc nhóm người đăng ký', async () => {
    const { app } = setup();
    for (const organizationId of [APPROVAL_ORG.id, 'khong-co']) {
      const res = await request(app).post('/api/auth/register').send({ ...validRegister, organizationId });
      expect(res.status).toBe(400);
    }
  });

  test('khi đóng đăng ký thì API register trả 404 và danh sách đơn vị cần đăng nhập', async () => {
    const { app } = setup(undefined, false);
    expect((await request(app).post('/api/auth/register').send(validRegister)).status).toBe(404);
    expect((await request(app).get('/api/organizations')).status).toBe(401);
    expect((await request(app).get('/api/auth/config')).body).toEqual({ selfRegistration: false });
  });

  test('GET /api/organizations chỉ trả đơn vị người đăng ký', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/organizations');
    expect(res.body.items.map((o) => o.id)).toEqual([ORG.id]);
  });
});

describe('đăng nhập', () => {
  test('đúng thông tin trả token và thông tin tài khoản', async () => {
    const { addUser, login } = setup();
    await addUser();
    const res = await login(' A@vlu.edu.vn');
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ fullName: 'Nguyễn Văn A', role: 'REQUESTER', organization: { name: ORG.name } });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  test('sai mật khẩu và email không tồn tại cùng trả 401 với thông điệp giống nhau', async () => {
    const { addUser, login } = setup();
    await addUser();
    const wrongPass = await login('a@vlu.edu.vn', 'SaiMatKhau1');
    const noUser = await login('khong-co@vlu.edu.vn', 'Matkhau123');
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body).toEqual(noUser.body);
  });

  test('tài khoản chờ duyệt và bị khóa không đăng nhập được', async () => {
    const { addUser, login } = setup();
    await addUser({ email: 'p@vlu.edu.vn', status: 'PENDING' });
    await addUser({ email: 'l@vlu.edu.vn', status: 'LOCKED' });
    expect((await login('p@vlu.edu.vn')).body.error.code).toBe('ACCOUNT_PENDING');
    expect((await login('l@vlu.edu.vn')).body.error.code).toBe('ACCOUNT_LOCKED');
    expect((await login('p@vlu.edu.vn')).status).toBe(403);
  });

  test('không lộ trạng thái tài khoản khi sai mật khẩu', async () => {
    const { addUser, login } = setup();
    await addUser({ status: 'PENDING' });
    expect((await login('a@vlu.edu.vn', 'SaiMatKhau1')).status).toBe(401);
  });

  test('thiếu email hoặc mật khẩu trả 400', async () => {
    const { login } = setup();
    expect((await login('', '')).status).toBe(400);
  });

  test('khóa tạm sau 5 lần sai liên tiếp, kể cả khi sau đó nhập đúng', async () => {
    const { addUser, login } = setup(createLoginLimiter({ max: 5 }));
    await addUser();
    for (let i = 0; i < 5; i++) await login('a@vlu.edu.vn', 'SaiMatKhau1');
    const res = await login();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });
});

describe('phiên đăng nhập', () => {
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });

  test('GET /api/auth/me cần token và trả đúng tài khoản', async () => {
    const { app, addUser, login } = setup();
    await addUser();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer('token-rac'))).status).toBe(401);
    const { token } = (await login()).body;
    const res = await request(app).get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('a@vlu.edu.vn');
  });

  test('khóa tài khoản có hiệu lực ngay với token đang dùng', async () => {
    const { app, db, addUser, login } = setup();
    await addUser();
    const { token } = (await login()).body;
    db.users[0].status = 'LOCKED';
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  test('POST /api/auth/logout trả 204 khi đã đăng nhập', async () => {
    const { app, addUser, login } = setup();
    await addUser();
    const { token } = (await login()).body;
    expect((await request(app).post('/api/auth/logout').set(bearer(token))).status).toBe(204);
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
  });
});

describe('quản trị tài khoản', () => {
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  async function withAdmin() {
    const ctx = setup();
    await ctx.addUser({ email: 'admin@vlu.edu.vn', role: 'ADMIN' });
    const { token } = (await ctx.login('admin@vlu.edu.vn')).body;
    return { ...ctx, token };
  }

  test('chỉ ADMIN xem được danh sách và lọc theo trạng thái', async () => {
    const { app, addUser, login, token } = await withAdmin();
    await addUser({ email: 'p@vlu.edu.vn', status: 'PENDING' });
    const res = await request(app).get('/api/users?status=PENDING').set(bearer(token));
    expect(res.body.items.map((u) => u.email)).toEqual(['p@vlu.edu.vn']);
    await addUser({ email: 'u@vlu.edu.vn' });
    const user = (await login('u@vlu.edu.vn')).body.token;
    expect((await request(app).get('/api/users').set(bearer(user))).status).toBe(403);
  });

  test('ADMIN duyệt tài khoản chờ rồi người đó đăng nhập được', async () => {
    const { app, addUser, login, token } = await withAdmin();
    const pending = await addUser({ email: 'p@vlu.edu.vn', status: 'PENDING' });
    const res = await request(app).patch(`/api/users/${pending.id}`).set(bearer(token)).send({ status: 'ACTIVE', role: 'APPROVER' });
    expect(res.body.user).toMatchObject({ status: 'ACTIVE', role: 'APPROVER' });
    expect((await login('p@vlu.edu.vn')).status).toBe(200);
  });

  test('từ chối giá trị lạ, tài khoản không có và tự khóa chính mình', async () => {
    const { app, db, token } = await withAdmin();
    const self = db.users[0].id;
    expect((await request(app).patch(`/api/users/${self}`).set(bearer(token)).send({ status: 'LOCKED' })).status).toBe(409);
    expect((await request(app).patch('/api/users/khong-co').set(bearer(token)).send({ status: 'ACTIVE' })).status).toBe(404);
    expect((await request(app).patch('/api/users/khong-co').set(bearer(token)).send({ role: 'ROOT' })).status).toBe(400);
    expect((await request(app).patch('/api/users/khong-co').set(bearer(token)).send({})).status).toBe(400);
  });
});

test('JSON hỏng trả 400 chứ không phải 500', async () => {
  const { app } = setup();
  const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{khong-phai-json');
  expect(res.status).toBe(400);
});

describe('thu hồi phiên khi đổi mật khẩu', () => {
  const jwt = require('jsonwebtoken');
  const oldToken = (id) => jwt.sign({ sub: id, iat: Math.floor(Date.now() / 1000) - 60 }, 'khoa-bi-mat-chi-dung-khi-kiem-thu');

  test('đổi mật khẩu: token cũ bị từ chối, token mới trong phản hồi dùng được', async () => {
    const { app, addUser, login } = setup();
    const u = await addUser();
    const token = (await login()).body.token;
    const res = await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'Matkhau123', newPassword: 'Matkhau456' });
    expect(res.status).toBe(200);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken(u.id)}`).expect(401);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(200);
  });

  test('admin đặt lại mật khẩu: token cũ của người dùng bị từ chối', async () => {
    const { app, addUser, login } = setup();
    await addUser({ email: 'admin@vlu.edu.vn', role: 'ADMIN' });
    const target = await addUser();
    const adminToken = (await login('admin@vlu.edu.vn')).body.token;
    await request(app).patch(`/api/users/${target.id}`).set('Authorization', `Bearer ${adminToken}`).send({ resetPassword: true }).expect(200);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken(target.id)}`).expect(401);
  });
});

describe('giới hạn thử mật khẩu hiện tại và độ dài mật khẩu', () => {
  test('đổi mật khẩu: sai quá số lần cho phép thì bị khóa tạm, kể cả khi sau đó nhập đúng', async () => {
    const { app, addUser, login } = setup(createLoginLimiter({ max: 2 }));
    await addUser();
    const token = (await login()).body.token;
    const change = (currentPassword) => request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({ currentPassword, newPassword: 'Matkhau456' });
    expect((await change('sai-1')).status).toBe(400);
    expect((await change('sai-2')).status).toBe(400);
    const res = await change('Matkhau123');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  test('mật khẩu quá 72 byte bị từ chối dù ít hơn 72 ký tự', async () => {
    const { app, addUser, login } = setup();
    await addUser();
    const token = (await login()).body.token;
    const res = await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'Matkhau123', newPassword: 'Aa1' + 'ậ'.repeat(24) });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('newPassword');
  });
});
