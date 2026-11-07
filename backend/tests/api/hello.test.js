const request = require('supertest');
const { createApp } = require('../src/app');

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
