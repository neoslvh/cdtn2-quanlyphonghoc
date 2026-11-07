const jwt = require('jsonwebtoken');
const { ApiError } = require('./errors');

// Kiểm tra đăng nhập và vai trò ở máy chủ (NFR-04), dùng chung cho mọi API.
function createGuards({ db, jwtSecret }) {
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
      // iat tính bằng giây nên so theo giây; token cấp trước lần đổi mật khẩu gần nhất bị thu hồi.
      if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
      }
      if (user.mustChangePassword && !allowMustChange) {
        throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi sử dụng hệ thống.');
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
  const forbidden = () => new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
  return {
    requireAuth: auth(false),
    requireAuthAny: auth(true),
    requireRole: (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : next(forbidden())),
  };
}

module.exports = { createGuards };
