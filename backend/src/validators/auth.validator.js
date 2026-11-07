const { ApiError } = require("../errors/ApiError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["REQUESTER", "APPROVER", "FACILITY_STAFF", "ADMIN"];
const STATUSES = ["PENDING", "ACTIVE", "LOCKED"];
const PASSWORD_MESSAGE = "Mật khẩu từ 8 ký tự, tối đa 72 byte (ký tự có dấu tính nhiều byte), gồm cả chữ và số.";

function validFullName(value) {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 150;
}

function validEmail(value) {
  return typeof value === "string" && EMAIL_RE.test(value.trim()) && value.length <= 255;
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 8 && Buffer.byteLength(value) <= 72 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function failValidation(details) {
  if (details.length) throw new ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details);
}

module.exports = { ROLES, STATUSES, PASSWORD_MESSAGE, validFullName, validEmail, validPassword, failValidation };
