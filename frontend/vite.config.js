import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy npm run dev, các lời gọi /api được chuyển sang backend ở cổng 3000.
export default defineConfig({
  plugins: [react()],
  // Giữ Host gốc để backend ghi đúng địa chỉ giao diện vào mã QR (FR-05).
  server: { proxy: { '/api': { target: process.env.API_TARGET || 'http://localhost:3000', changeOrigin: false } } },
});
