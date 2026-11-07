class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

// Lỗi vi phạm ràng buộc unique của Prisma (P2002), dùng để chuyển thành lỗi nghiệp vụ khi hai yêu cầu chạy cùng lúc.
const isUniqueViolation = (err) => Boolean(err) && err.code === 'P2002';

module.exports = { ApiError, isUniqueViolation };
