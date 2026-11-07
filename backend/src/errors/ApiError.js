class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    Object.assign(this, { status, code, details });
  }
}

module.exports = { ApiError };
