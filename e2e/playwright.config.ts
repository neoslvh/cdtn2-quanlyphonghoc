import { defineConfig } from '@playwright/test';

// Chạy trên hệ thống đã dựng: docker compose up -d --build (mặc định http://localhost:8080).
// Đổi địa chỉ bằng biến E2E_BASE_URL. Dùng Chrome đã cài trên máy (channel chrome), không tải Chromium riêng.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Các test dùng chung một cơ sở dữ liệu nên chạy tuần tự để dữ liệu mỗi test không chồng nhau.
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    channel: 'chrome',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
