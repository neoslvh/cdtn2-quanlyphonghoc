const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { Router } = require('express');
const { ApiError } = require('./errors/ApiError');
const { createLoginLimiter, generateTemporaryPassword } = require('./services/auth.service');
const { createAuthMiddleware } = require('./middleware/auth');
const { ROLES, STATUSES, PASSWORD_MESSAGE, validFullName, validEmail, validPassword, failValidation } = require('./validators/auth.validator');

const TOKEN_TTL = '8h';
const toUser = (u) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  role: u.role,
  status: u.status,
  mustChangePassword: Boolean(u.mustChangePassword),
  organization: u.organization && { id: u.organization.id, name: u.organization.name, type: u.organization.type },
});



// Băm của một chuỗi ngẫu nhiên, chỉ dùng để so khớp giả khi email không tồn tại.
const DUMMY_HASH = bcrypt.hashSync('khong-ton-tai-' + Math.random(), 10);

function authRoutes({ db, jwtSecret, bcryptRounds = 10, limiter = createLoginLimiter(), allowRegistration = false }) {
  const router = Router();
  const hash = (p) => bcrypt.hash(p, bcryptRounds);
  const signToken = async (u) => {
    const jti = randomUUID();
    await db.createSession({ id: jti, userId: u.id, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) });
    return jwt.sign({ sub: u.id, role: u.role, org: u.organizationId, jti }, jwtSecret, { expiresIn: TOKEN_TTL });
  };

  const { requireAuth, requireAuthAny, requireRole } = createAuthMiddleware({ db, jwtSecret });

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
      if (!validPassword(password)) details.push({ field: 'password', message: PASSWORD_MESSAGE });
      if (typeof organizationId !== 'string' || !organizationId) details.push({ field: 'organizationId', message: 'Vui lòng chọn đơn vị.' });
      failValidation(details);
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
      res.json({ token: await signToken(user), user: toUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/me', requireAuthAny, (req, res) => res.json({ user: toUser(req.user) }));

  router.post('/auth/logout', requireAuthAny, async (req, res, next) => {
    try { await db.revokeSession(req.auth.jti, 'LOGOUT'); res.status(204).end(); } catch (err) { next(err); }
  });

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
      failValidation(validPassword(newPassword) ? [] : [{ field: 'newPassword', message: PASSWORD_MESSAGE }]);
      if (newPassword === currentPassword) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới phải khác mật khẩu hiện tại.', [{ field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }]);
      }
      await db.revokeUserSessions(req.user.id, 'PASSWORD_CHANGED');
      const user = await db.updateUser(req.user.id, { passwordHash: await hash(newPassword), mustChangePassword: false, passwordChangedAt: new Date() });
      res.json({ user: toUser(user), token: await signToken(user) });
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
      failValidation(details);
      const key = email.trim().toLowerCase();
      const org = await db.findOrganization(organizationId);
      if (!org || !org.active) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Đơn vị không hợp lệ.', [{ field: 'organizationId', message: 'Đơn vị không hợp lệ.' }]);
      }
      if (await db.findUserByEmail(key)) throw new ApiError(409, 'EMAIL_EXISTS', 'Email này đã có tài khoản.');
      const temporaryPassword = generateTemporaryPassword();
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
      failValidation(details);
      let temporaryPassword;
      if (resetPassword === true) {
        temporaryPassword = generateTemporaryPassword();
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
      if (data.passwordHash || data.status === 'LOCKED' || data.role) await db.revokeUserSessions(user.id, data.status === 'LOCKED' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_CHANGED');
      res.json({ user: toUser(user), ...(temporaryPassword && { temporaryPassword }) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { authRoutes, createLoginLimiter, ApiError };
