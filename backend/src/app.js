const express = require("express");
const authRoutes = require("./routes/auth.routes");
const roomRoutes = require("./routes/room.routes");
const requestRoutes = require("./routes/request.routes");
const equipmentRoutes = require("./routes/equipment.routes");
const scheduleRoutes = require("./routes/schedule.routes");
const { createAuthMiddleware } = require("./middleware/auth");
const { ApiError } = require("./errors/ApiError");
const { logger, requestContext } = require("./logger");

function buildApp({ db, jwtSecret = "khoa-bi-mat-chi-dung-khi-kiem-thu", bcryptRounds, limiter, allowRegistration } = {}) {
  const app = express();

  app.use(requestContext);
  // File CSV/XLSX được gửi dạng base64 đến endpoint import lịch học.
  app.use(express.json({ limit: "15mb" }));
  app.use((req, res, next) => {
    const allowedOrigins = [
      process.env.FRONTEND_ORIGIN,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ].filter(Boolean);
    const origin = req.get("origin");
    if (origin && allowedOrigins.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  app.get("/health/live", (_req, res) => res.status(200).json({ status: "ok" }));
  app.get("/health", async (req, res) => {
    try {
      await db.healthcheck();
      res.status(200).json({ status: "ok", db: "ok" });
    } catch (error) {
      logger.error("healthcheck_database_failed", { request_id: req.requestId, error });
      res.status(503).json({ status: "degraded", db: "unavailable", requestId: req.requestId });
    }
  });

  app.get("/api/hello", async (_req, res, next) => {
    try {
      const roomCount = await db.countRooms();
      res.json({ message: "Xin chào từ API quản lý phòng học", roomCount });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", authRoutes({ db, jwtSecret, bcryptRounds, limiter, allowRegistration }));
  app.use("/api", roomRoutes({ db, ...createAuthMiddleware({ db, jwtSecret }) }));
  app.use("/api", requestRoutes({ db, ...createAuthMiddleware({ db, jwtSecret }) }));
  app.use("/api", equipmentRoutes({ db, ...createAuthMiddleware({ db, jwtSecret }) }));
  app.use("/api", scheduleRoutes({ db, ...createAuthMiddleware({ db, jwtSecret }) }));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy endpoint.", details: [] } });
  });

  app.use((error, req, res, _next) => {
    if (error.type === "entity.parse.failed") {
      logger.info("request_body_invalid", { request_id: req.requestId, status_code: 400 });
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Nội dung gửi lên không phải JSON hợp lệ." } });
    }
    if (error.type === "entity.too.large") {
      logger.info("request_body_too_large", { request_id: req.requestId, status_code: 413 });
      return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Dữ liệu gửi lên vượt giới hạn cho phép." } });
    }
    if (error instanceof ApiError) {
      logger.info("business_error", { request_id: req.requestId, error_code: error.code, status_code: error.status, details: error.details });
      return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    }
    // Các ràng buộc unique/FK và exclusion constraint của PostgreSQL là lớp bảo vệ
    // cuối cùng khi hai yêu cầu được gửi đồng thời.
    if (["P2002", "P2003", "P2010"].includes(error?.code) || error?.code === "23P01") {
      logger.info("database_conflict", { request_id: req.requestId, error_code: error.code });
      return res.status(409).json({ error: { code: "DATA_CONFLICT", message: "Dữ liệu bị trùng hoặc đã thay đổi bởi thao tác khác.", details: [] } });
    }
    logger.error("unexpected_error", { request_id: req.requestId, error });
    return res.status(500).json({ message: "Lỗi máy chủ" });
  });

  return app;
}

// Giữ tên cũ cho bộ test và các nơi đang import createApp.
const createApp = buildApp;

module.exports = { buildApp, createApp };
