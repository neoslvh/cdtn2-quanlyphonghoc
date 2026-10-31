const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Router } = require('express');

const TOKEN_TTL = '8h';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['REQUESTER', 'APPROVER', 'FACILITY_STAFF', 'ADMIN'];
const STATUSES = ['PENDING', 'ACTIVE', 'LOCKED'];

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

const toUser = (u) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  role: u.role,
  status: u.status,
  mustChangePassword: Boolean(u.mustChangePassword),
  organization: u.organization && { id: u.organization.id, name: u.organization.name, type: u.organization.type },
});

const validFullName = (v) => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 150;
const validEmail = (v) => typeof v === 'string' && EMAIL_RE.test(v.trim()) && v.length <= 255;
// bcrypt chỉ đọc 72 byte đầu nên giới hạn theo byte, ký tự có dấu chiếm nhiều byte hơn.
const validPassword = (v) => typeof v === 'string' && v.length >= 8 && Buffer.byteLength(v) <= 72 && /[A-Za-z]/.test(v) && /\d/.test(v);
const PASSWORD_MSG = 'Mật khẩu từ 8 ký tự, tối đa 72 byte (ký tự có dấu tính nhiều byte), gồm cả chữ và số.';

function fail(details) {
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.', details);
}

// Mật khẩu tạm 12 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/l/I), luôn có cả chữ và số để qua được quy tắc mật khẩu.
function generateTempPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(digits), ...Array.from({ length: 10 }, () => pick(letters + digits))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// Giới hạn số lần đăng nhập sai theo email để chặn dò mật khẩu. Bộ nhớ tiến trình, đủ cho một máy chủ.
// ponytail: dùng Redis hoặc bảng cơ sở dữ liệu khi chạy nhiều tiến trình.
function createLoginLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const fails = new Map();
  const live = (key) => (fails.get(key) || []).filter((t) => Date.now() - t < windowMs);
  return {
    blocked: (key) => live(key).length >= max,
    fail: (key) => {
      // Dọn khóa đã hết hạn khi Map lớn, tránh phình bộ nhớ khi bị gửi nhiều email ngẫu nhiên.
      if (fails.size > 1000) for (const k of fails.keys()) if (!live(k).length) fails.delete(k);
      fails.set(key, [...live(key), Date.now()]);
    },
    reset: (key) => fails.delete(key),
  };
}

// Băm của một chuỗi ngẫu nhiên, chỉ dùng để so khớp giả khi email không tồn tại.
const DUMMY_HASH = bcrypt.hashSync('khong-ton-tai-' + Math.random(), 10);

function authRoutes({ db, jwtSecret, bcryptRounds = 10, limiter = createLoginLimiter(), allowRegistration = false }) {
  const router = Router();
  const hash = (p) => bcrypt.hash(p, bcryptRounds);
  const signToken = (u) => jwt.sign({ sub: u.id, role: u.role, org: u.organizationId }, jwtSecret, { expiresIn: TOKEN_TTL });

  // allowMustChange: cho phép tài khoản đang bị bắt đổi mật khẩu đi qua (chỉ me, logout, change-password).
  const auth = (allowMustChange) => async (req, res, next) => {
    try {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!m) throw new ApiError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');
      let payload;
      try {
        payload = jwt.verify(m[1], jwtSecret);
      } catch {
        throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
      }
      // Đọc lại từ cơ sở dữ liệu để khóa tài khoản có hiệu lực ngay, không phải chờ token hết hạn.
      const user = await db.findUserById(payload.sub);
      if (!user || user.status !== 'ACTIVE') throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
      if (user.mustChangePassword && !allowMustChange) {
        throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi sử dụng hệ thống.');
      }
      // iat tính bằng giây nên so theo giây; token cấp trước lần đổi mật khẩu gần nhất bị thu hồi.
      if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
  const requireAuth = auth(false);
  const requireAuthAny = auth(true);
  const requireRole = (...roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : next(new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.'));

  router.get('/auth/config', (req, res) => res.json({ selfRegistration: allowRegistration }));

  // Danh sách đơn vị. Không có scope thì chỉ trả đơn vị người đăng ký, và công khai khi bật tự đăng ký.
  router.get('/organizations', (req, res, next) => {
    if (req.query.scope === 'all' || !allowRegistration) return requireAuth(req, res, next);
    next();
  }, async (req, res, next) => {
    try {
      res.json({ items: await db.listOrganizations({ all: req.query.scope === 'all' }) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/register', async (req, res, next) => {
    try {
      if (!allowRegistration) throw new ApiError(404, 'NOT_FOUND', 'Hệ thống không mở đăng ký tự do. Vui lòng liên hệ quản trị viên để được cấp tài khoản.');
      const { fullName, email, password, organizationId } = req.body || {};
      const details = [];
      if (!validFullName(fullName)) details.push({ field: 'fullName', message: 'Họ và tên từ 2 đến 150 ký tự.' });
      if (!validEmail(email)) details.push({ field: 'email', message: 'Email không đúng định dạng.' });
      if (!validPassword(password)) details.push({ field: 'password', message: PASSWORD_MSG });
      if (typeof organizationId !== 'string' || !organizationId) details.push({ field: 'organizationId', message: 'Vui lòng chọn đơn vị.' });
      fail(details);
      const key = email.trim().toLowerCase();
      const org = await db.findOrganization(organizationId);
      if (!org || !org.active || org.type !== 'REQUESTER_UNIT') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Đơn vị không hợp lệ.', [{ field: 'organizationId', message: 'Đơn vị không hợp lệ.' }]);
      }
      if (await db.findUserByEmail(key)) throw new ApiError(409, 'EMAIL_EXISTS', 'Email này đã được đăng ký.');
      const user = await db.createUser({
        organizationId: org.id,
        fullName: fullName.trim(),
        email: key,
        passwordHash: await hash(password),
        role: 'REQUESTER',
        status: 'PENDING',
      });
      res.status(201).json({ user: toUser({ ...user, organization: org }) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Vui lòng nhập email và mật khẩu.');
      }
      const key = email.trim().toLowerCase();
      if (limiter.blocked(key)) {
        throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút.');
      }
      const user = await db.findUserByEmail(key);
      // So khớp cả khi không có tài khoản để thời gian phản hồi không lộ email có tồn tại hay không.
      const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
      if (!user || !ok) {
        limiter.fail(key);
        throw new ApiError(401, 'UNAUTHORIZED', 'Email hoặc mật khẩu không đúng.');
      }
      if (user.status === 'PENDING') throw new ApiError(403, 'ACCOUNT_PENDING', 'Tài khoản đang chờ quản trị viên duyệt.');
      if (user.status !== 'ACTIVE') throw new ApiError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.');
      limiter.reset(key);
      res.json({ token: signToken(user), user: toUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/me', requireAuthAny, (req, res) => res.json({ user: toUser(req.user) }));

  // Đăng xuất: JWT không trạng thái nên máy khách tự xóa token. Ghi audit_log bổ sung khi có bảng (PB-21).
  router.post('/auth/logout', requireAuthAny, (req, res) => res.status(204).end());

  router.post('/auth/change-password', requireAuthAny, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      // Cùng bộ giới hạn với đăng nhập, để token bị lộ không dùng để dò mật khẩu hiện tại.
      const key = `pw:${req.user.id}`;
      if (limiter.blocked(key)) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Nhập sai mật khẩu hiện tại quá nhiều lần, vui lòng thử lại sau 15 phút.');
      if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
        limiter.fail(key);
        throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu hiện tại không đúng.', [{ field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng.' }]);
      }
      limiter.reset(key);
      fail(validPassword(newPassword) ? [] : [{ field: 'newPassword', message: PASSWORD_MSG }]);
      if (newPassword === currentPassword) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới phải khác mật khẩu hiện tại.', [{ field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }]);
      }
      const user = await db.updateUser(req.user.id, { passwordHash: await hash(newPassword), mustChangePassword: false, passwordChangedAt: new Date() });
      // Các token cũ bị thu hồi nên cấp token mới cho phiên hiện tại.
      res.json({ user: toUser(user), token: signToken(user) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/users', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const { status } = req.query;
      if (status !== undefined && !STATUSES.includes(status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Trạng thái không hợp lệ.');
      const users = await db.listUsers({ status });
      res.json({ items: users.map(toUser), total: users.length });
    } catch (err) {
      next(err);
    }
  });

  // Admin tạo tài khoản: hệ thống sinh mật khẩu tạm, trả về đúng một lần, người dùng phải đổi ở lần đăng nhập đầu.
  router.post('/users', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const { fullName, email, organizationId, role } = req.body || {};
      const details = [];
      if (!validFullName(fullName)) details.push({ field: 'fullName', message: 'Họ và tên từ 2 đến 150 ký tự.' });
      if (!validEmail(email)) details.push({ field: 'email', message: 'Email không đúng định dạng.' });
      if (!ROLES.includes(role)) details.push({ field: 'role', message: 'Vai trò không hợp lệ.' });
      if (typeof organizationId !== 'string' || !organizationId) details.push({ field: 'organizationId', message: 'Vui lòng chọn đơn vị.' });
      fail(details);
      const key = email.trim().toLowerCase();
      const org = await db.findOrganization(organizationId);
      if (!org || !org.active) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Đơn vị không hợp lệ.', [{ field: 'organizationId', message: 'Đơn vị không hợp lệ.' }]);
      }
      if (await db.findUserByEmail(key)) throw new ApiError(409, 'EMAIL_EXISTS', 'Email này đã có tài khoản.');
      const temporaryPassword = generateTempPassword();
      const user = await db.createUser({
        organizationId: org.id,
        fullName: fullName.trim(),
        email: key,
        passwordHash: await hash(temporaryPassword),
        role,
        status: 'ACTIVE',
        mustChangePassword: true,
      });
      res.status(201).json({ user: toUser({ ...user, organization: org }), temporaryPassword });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const { status, role, fullName, resetPassword } = req.body || {};
      const data = {};
      const details = [];
      if (status !== undefined) STATUSES.includes(status) ? (data.status = status) : details.push({ field: 'status', message: 'Trạng thái không hợp lệ.' });
      if (role !== undefined) ROLES.includes(role) ? (data.role = role) : details.push({ field: 'role', message: 'Vai trò không hợp lệ.' });
      if (fullName !== undefined) validFullName(fullName) ? (data.fullName = fullName.trim()) : details.push({ field: 'fullName', message: 'Họ và tên từ 2 đến 150 ký tự.' });
      fail(details);
      let temporaryPassword;
      if (resetPassword === true) {
        temporaryPassword = generateTempPassword();
        data.passwordHash = await hash(temporaryPassword);
        data.mustChangePassword = true;
        data.passwordChangedAt = new Date();
      }
      if (!Object.keys(data).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Không có trường nào để cập nhật.');
      if (req.params.id === req.user.id && (data.status || data.role)) {
        throw new ApiError(409, 'INVALID_STATE', 'Không thể tự đổi vai trò hoặc khóa tài khoản của chính mình.');
      }
      const user = await db.updateUser(req.params.id, data);
      if (!user) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.');
      res.json({ user: toUser(user), ...(temporaryPassword && { temporaryPassword }) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { authRoutes, createLoginLimiter, ApiError };
