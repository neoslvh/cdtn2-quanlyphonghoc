import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Xử lý phiên hết hạn trong api(): 401 khi đang có token thì xóa token và phát sự kiện để giao diện về trang đăng nhập.
// Chạy trong môi trường node nên giả lập localStorage, window và fetch.
let store;
let events;
let api;
let SESSION_EXPIRED;

beforeEach(async () => {
  store = new Map();
  events = [];
  vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) });
  const target = new EventTarget();
  target.addEventListener('auth:expired', (e) => events.push(e.type));
  vi.stubGlobal('window', target);
  vi.resetModules();
  ({ api, SESSION_EXPIRED } = await import('./api'));
});
afterEach(() => vi.unstubAllGlobals());

const reply = (status, body) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));
const err401 = { error: { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' } };

describe('phiên hết hạn', () => {
  test('401 khi có token: xóa token, phát sự kiện, vẫn báo lỗi cho trang gọi', async () => {
    store.set('qlphong.token', 'token-cu');
    reply(401, err401);
    await expect(api('/requests')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(store.has('qlphong.token')).toBe(false);
    expect(events).toEqual([SESSION_EXPIRED]);
  });

  test('sai mật khẩu ở /auth/login trả 401 nhưng không phải hết phiên', async () => {
    reply(401, err401);
    await expect(api('/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' } })).rejects.toMatchObject({ status: 401 });
    expect(events).toEqual([]);
  });

  test('401 khi chưa có token thì không phát sự kiện', async () => {
    reply(401, err401);
    await expect(api('/requests')).rejects.toMatchObject({ status: 401 });
    expect(events).toEqual([]);
  });

  test('lỗi khác 401 (403) giữ nguyên token', async () => {
    store.set('qlphong.token', 'token-con-han');
    reply(403, { error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } });
    await expect(api('/users')).rejects.toMatchObject({ status: 403 });
    expect(store.get('qlphong.token')).toBe('token-con-han');
    expect(events).toEqual([]);
  });
});
