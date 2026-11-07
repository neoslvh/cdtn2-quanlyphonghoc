const jwt = require("jsonwebtoken");
const { ApiError } = require("../errors/ApiError");

function createAuthMiddleware({ db, jwtSecret }) {
  const authenticate = (allowMustChange) => async (req, _res, next) => {
    try {
      const matched = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!matched) throw new ApiError(401, "UNAUTHORIZED", "Chưa đăng nhập.");

      let payload;
      try {
        payload = jwt.verify(matched[1], jwtSecret);
      } catch {
        throw new ApiError(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
      }

      if (!payload.jti) throw new ApiError(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
      const session = await db.findSession(payload.jti);
      if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) throw new ApiError(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");

      const user = await db.findUserById(payload.sub);
      if (!user || user.status !== "ACTIVE") throw new ApiError(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
      if (user.mustChangePassword && !allowMustChange) throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Bạn cần đổi mật khẩu trước khi sử dụng hệ thống.");
      if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) throw new ApiError(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");

      req.user = user;
      req.auth = payload;
      next();
    } catch (error) {
      next(error);
    }
  };

  return {
    requireAuth: authenticate(false),
    requireAuthAny: authenticate(true),
    requireRole: (...roles) => (req, _res, next) =>
      roles.includes(req.user.role) ? next() : next(new ApiError(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.")),
  };
}

module.exports = { createAuthMiddleware };
