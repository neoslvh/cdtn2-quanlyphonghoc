const { randomUUID } = require("node:crypto");

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel =
  LEVELS[String(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;
const sensitiveKeys = ["password", "passwordhash", "token", "jwt", "authorization", "secret", "database_url", "connection", "dsn", "uri", "url"];

function redactText(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s@/]+(?::[^\s@]+)?@/gi, "postgresql://***@")
    .replace(/\b(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=***");
}

function redact(value) {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, code: value.code, message: redactText(value.message), stack: value.stack ? redactText(value.stack) : undefined };
  }
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeys.some((word) => key.toLowerCase().includes(word)) ? "***" : redact(item),
    ]),
  );
}

function write(level, message, context = {}) {
  if ((LEVELS[level] ?? LEVELS.info) < configuredLevel) return;
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...redact(context) })}\n`);
}

const logger = Object.fromEntries(
  Object.keys(LEVELS).map((level) => [level, (message, context) => write(level, message, context)]),
);

function requestContext(req, res, next) {
  const suppliedId = req.get("x-request-id");
  req.requestId = typeof suppliedId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(suppliedId) ? suppliedId : randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  const startedAt = Date.now();
  res.on("finish", () => logger.info("request_completed", { request_id: req.requestId, method: req.method, path: req.path, status_code: res.statusCode, duration_ms: Date.now() - startedAt }));
  next();
}

module.exports = { logger, requestContext, redact, redactText };
