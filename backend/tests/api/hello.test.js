const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../../src/app');

test('GET /api/hello trả về lời chào và số phòng', async () => {
  const app = createApp({ db: { countRooms: async () => 2 } });
  const res = await request(app).get('/api/hello');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'Xin chào từ API quản lý phòng học', roomCount: 2 });
});

test('GET /api/hello trả về 500 khi cơ sở dữ liệu lỗi', async () => {
  const app = createApp({ db: { countRooms: async () => { throw new Error('mất kết nối'); } } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await request(app).get('/api/hello');
  expect(res.status).toBe(500);
  expect(res.body.message).toBe('Lỗi máy chủ');
});

test('khi có CLIENT_DIST_DIR, web trả HTML còn API không tồn tại trả JSON 404', async () => {
  const clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qlphong-client-'));
  const previous = process.env.CLIENT_DIST_DIR;
  fs.writeFileSync(path.join(clientDir, 'index.html'), '<h1>Quản lý phòng</h1>');
  process.env.CLIENT_DIST_DIR = clientDir;
  try {
    const app = createApp({ db: { countRooms: async () => 0 } });
    const home = await request(app).get('/');
    expect([home.status, home.text]).toEqual([200, '<h1>Quản lý phòng</h1>']);
    const api = await request(app).get('/api/khong-co');
    expect(api.status).toBe(404);
    expect(api.body.error.code).toBe('NOT_FOUND');
    const missingAsset = await request(app).get('/assets/khong-co.js');
    expect(missingAsset.status).toBe(404);
  } finally {
    if (previous === undefined) delete process.env.CLIENT_DIST_DIR;
    else process.env.CLIENT_DIST_DIR = previous;
    fs.rmSync(clientDir, { recursive: true, force: true });
  }
});
