require("dotenv").config();

const { buildApp } = require("./app");
const { createDatabase } = require("./db");
const { logger } = require("./logger");

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  logger.error("configuration_invalid", {
    reason: "JWT_SECRET must contain at least 16 characters",
  });
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
// Giống source mẫu: lắng nghe trên mọi network interface để Docker publish được cổng.
const host = process.env.HOST || "0.0.0.0";
const db = createDatabase();
const app = buildApp({
  db,
  jwtSecret,
  // Mặc định tài khoản do quản trị viên cấp. Chỉ bật khi cần demo đăng ký tự do.
  allowRegistration: process.env.ALLOW_SELF_REGISTRATION === "true",
});

const server = app.listen(port, host, () => {
  logger.info("server_started", { host, port });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server_stopping", { signal });

  server.close(async () => {
    try {
      await db.disconnect();
      logger.info("database_disconnected");
      process.exit(0);
    } catch (error) {
      logger.error("shutdown_failed", { error });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("shutdown_timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
