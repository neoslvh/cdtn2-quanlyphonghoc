const { Router } = require("express");
const XLSX = require("xlsx");
const { ApiError } = require("../errors/ApiError");

function input(body) {
  const { roomId, courseCode, classCode, courseName = "", semester = "", startAt, endAt, status = "ACTIVE" } = body || {};
  const start = new Date(startAt); const end = new Date(endAt);
  if (!Number.isInteger(roomId) || !courseCode?.trim() || !classCode?.trim() || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new ApiError(400, "VALIDATION_ERROR", "Dữ liệu lịch học không hợp lệ.");
  return { roomId, courseCode: courseCode.trim(), classCode: classCode.trim(), courseName: String(courseName).trim(), semester: String(semester).trim(), startAt: start, endAt: end, status };
}
async function normalizeRows(db, rows) {
  if (!Array.isArray(rows) || !rows.length) throw new ApiError(400, "VALIDATION_ERROR", "Cần ít nhất một dòng lịch học.");
  const valid = []; const errors = [];
  for (let index = 0; index < rows.length; index += 1) {
    try {
      const row = { ...rows[index] };
      if (typeof row.roomId === "string" && /^\d+$/.test(row.roomId.trim())) row.roomId = Number(row.roomId);
      if (!Number.isInteger(row.roomId) && row.roomCode) { const room = await db.findRoomByCode(String(row.roomCode).trim()); row.roomId = room?.id; }
      const data = input(row);
      const room = await db.findRoom(data.roomId);
      if (!room || room.status !== "ACTIVE") throw new ApiError(400, "ROOM_UNAVAILABLE", "Phòng không tồn tại hoặc không hoạt động.");
      if (await db.findScheduleConflict(data)) throw new ApiError(409, "SCHEDULE_CONFLICT", "Trùng lịch học trong phòng.");
      valid.push(data);
    } catch (error) { errors.push({ row: index + 1, code: error.code || "VALIDATION_ERROR", message: error.message }); }
  }
  return { valid, errors };
}
function field(row, ...names) { const found = Object.keys(row || {}).find((key) => names.includes(key.toLowerCase().replace(/[ _-]/g, ""))); return found ? row[found] : undefined; }
function toCanonicalRow(row) {
  return {
    roomId: field(row, "roomid"), roomCode: field(row, "roomcode", "maphong"), courseCode: field(row, "coursecode", "mamonhoc"), classCode: field(row, "classcode", "malop"), courseName: field(row, "coursename", "tenmonhoc") || "", semester: field(row, "semester", "hocky") || "", startAt: field(row, "startat", "batdau"), endAt: field(row, "endat", "ketthuc"), weekday: field(row, "weekday", "thu"), startTime: field(row, "starttime", "giobatdau"), endTime: field(row, "endtime", "gioketthuc"),
  };
}
function parseFileRows(body) {
  if (Array.isArray(body?.rows)) return body.rows.map(toCanonicalRow);
  if (typeof body?.fileBase64 !== "string" || !body.fileBase64) throw new ApiError(400, "VALIDATION_ERROR", "Cần gửi rows hoặc fileBase64 CSV/XLSX.");
  let workbook;
  try { workbook = XLSX.read(Buffer.from(body.fileBase64, "base64"), { type: "buffer", cellDates: false }); } catch { throw new ApiError(400, "IMPORT_FILE_INVALID", "Không đọc được file CSV/XLSX."); }
  const sheet = workbook.Sheets[body.sheetName || workbook.SheetNames[0]];
  if (!sheet) throw new ApiError(400, "IMPORT_FILE_INVALID", "Không tìm thấy worksheet cần import.");
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }).map(toCanonicalRow);
}
function expandWeeklyRows(rows, { semesterStart, semesterEnd }) {
  if (!semesterStart || !semesterEnd) return rows;
  const from = new Date(`${semesterStart}T00:00:00Z`); const to = new Date(`${semesterEnd}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new ApiError(400, "VALIDATION_ERROR", "Khoảng thời gian học kỳ không hợp lệ.");
  const expanded = [];
  for (const row of rows) {
    if (row.startAt && row.endAt) { expanded.push(row); continue; }
    const weekday = Number(row.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !row.startTime || !row.endTime) { expanded.push(row); continue; }
    const date = new Date(from);
    const expectedJsDay = weekday === 7 ? 0 : weekday;
    date.setUTCDate(date.getUTCDate() + ((expectedJsDay - date.getUTCDay() + 7) % 7));
    while (date <= to) {
      const yyyyMmDd = date.toISOString().slice(0, 10);
      expanded.push({ ...row, startAt: `${yyyyMmDd}T${row.startTime}:00+07:00`, endAt: `${yyyyMmDd}T${row.endTime}:00+07:00` });
      date.setUTCDate(date.getUTCDate() + 7);
    }
  }
  return expanded;
}
module.exports = function scheduleRoutes({ db, requireAuth, requireRole }) {
  const router = Router(); const guard = [requireAuth, requireRole("APPROVER", "ADMIN")];
  router.get("/period-slots", ...guard, async (_req, res, next) => { try { res.json({ items: await db.listPeriodSlots() }); } catch (error) { next(error); } });
  router.get("/class-schedules", ...guard, async (req, res, next) => { try { const where = {}; if (req.query.semester) where.semester = req.query.semester; if (req.query.roomId) where.roomId = Number(req.query.roomId); res.json({ items: await db.listSchedules(where) }); } catch (error) { next(error); } });
  router.post("/class-schedules", ...guard, async (req, res, next) => { try { const data = input(req.body); if (await db.findScheduleConflict(data)) throw new ApiError(409, "SCHEDULE_CONFLICT", "Trùng lịch học trong phòng."); res.status(201).json({ schedule: await db.createSchedule(data) }); } catch (error) { next(error); } });
  router.patch("/class-schedules/:id", ...guard, async (req, res, next) => { try { const data = input(req.body); if (await db.findScheduleConflict({ ...data, exceptScheduleId: req.params.id })) throw new ApiError(409, "SCHEDULE_CONFLICT", "Trùng lịch học trong phòng."); const schedule = await db.updateSchedule(req.params.id, data); if (!schedule) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy lịch học."); res.json({ schedule }); } catch (error) { next(error); } });
  router.delete("/class-schedules/:id", ...guard, async (req, res, next) => { try { const schedule = await db.cancelSchedule(req.params.id); if (!schedule) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy lịch học."); res.status(204).end(); } catch (error) { next(error); } });
  // Frontend/parser gửi rows JSON (từ CSV/XLSX). Preview không ghi dữ liệu vào DB.
  router.post("/class-schedules/import/preview", ...guard, async (req, res, next) => { try { const rows = expandWeeklyRows(parseFileRows(req.body), req.body || {}); const result = await normalizeRows(db, rows); res.json({ totalRows: rows.length, validRows: result.valid.length, invalidRows: result.errors, canImport: result.errors.length === 0 }); } catch (error) { next(error); } });
  router.post("/class-schedules/import", ...guard, async (req, res, next) => { try { const { semester, mode = "APPEND" } = req.body || {}; if (!semester?.trim() || !["APPEND", "REPLACE_SEMESTER"].includes(mode)) throw new ApiError(400, "VALIDATION_ERROR", "Học kỳ hoặc chế độ import không hợp lệ."); if (mode === "REPLACE_SEMESTER" && req.user.role !== "ADMIN") throw new ApiError(403, "FORBIDDEN", "Chỉ quản trị viên được thay thế lịch theo học kỳ."); const rows = expandWeeklyRows(parseFileRows(req.body), req.body || {}); const result = await normalizeRows(db, rows); if (result.errors.length) throw new ApiError(400, "IMPORT_VALIDATION_ERROR", "Dữ liệu import có lỗi.", result.errors); const batch = await db.createImportBatch({ semester: semester.trim(), mode, createdBy: req.user.id, status: "PREVIEW" }); const schedules = result.valid.map((item) => ({ ...item, semester: semester.trim(), createdBy: req.user.id })); await db.importSchedules({ batchId: batch.id, schedules, replaceSemester: mode === "REPLACE_SEMESTER" ? semester.trim() : null }); res.status(201).json({ importBatchId: batch.id, imported: schedules.length }); } catch (error) { next(error); } });
  return router;
};
