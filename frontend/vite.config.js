import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy npm run dev, các lời gọi /api được chuyển sang backend ở cổng 3000.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
