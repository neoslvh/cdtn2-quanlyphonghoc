const crypto = require("node:crypto");

function createLoginLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map();
  const active = (key) =>
    (failures.get(key) || []).filter((time) => Date.now() - time < windowMs);

  return {
    blocked: (key) => active(key).length >= max,
    fail: (key) => failures.set(key, [...active(key), Date.now()]),
    reset: (key) => failures.delete(key),
  };
}

function generateTemporaryPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (characters) => characters[crypto.randomInt(characters.length)];
  const password = [pick(letters), pick(digits), ...Array.from({ length: 10 }, () => pick(letters + digits))];

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join("");
}

module.exports = { createLoginLimiter, generateTemporaryPassword };
