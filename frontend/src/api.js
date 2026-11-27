import { ApiError } from './errors';

export { ApiError };

const TOKEN_KEY = 'qlphong.token';
export const SESSION_EXPIRED = 'auth:expired';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

// Gọi API, tự gắn token và đổi lỗi theo mẫu { error: { code, message, details } } thành ApiError.
// Các API của phòng, yêu cầu, lịch học chưa có ở máy chủ nên có thể chạy trên dữ liệu giả (src/mock).
// Chỉ bật khi chủ động đặt VITE_API_MOCK=true (npm run dev đã đặt sẵn trong .env.development), để bản triển khai thật không vô tình dùng dữ liệu giả.
export const USE_MOCK = import.meta.env.VITE_API_MOCK === 'true';

export async function api(path, { method = 'GET', body } = {}) {
  if (USE_MOCK) {
    // Nạp theo yêu cầu để bản build thật không mang theo mã dữ liệu giả.
    const mock = await import('./mock');
    if (mock.mockHandles(method, path)) return mock.mockCall(method, path, body);
  }
  const headers = {};
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Vui lòng thử lại sau.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    // 401 khi đang có token (trừ lúc đăng nhập) nghĩa là phiên đã hết hạn, bị khóa hoặc bị đặt lại mật khẩu.
    if (res.status === 401 && token && path !== '/auth/login') {
      setToken(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    }
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Lỗi máy chủ (${res.status})`, e.details);
  }
  return data;
}

// Máy chủ trả 404 với thông điệp này cho đường dẫn API chưa được cài đặt (backend/src/app.js).
// Giao diện dùng để hiện "chức năng đang chờ API" thay vì báo lỗi, cho các màn hình làm trước phần backend.
export const isApiPending = (err) => err?.status === 404 && err.message === 'Không tìm thấy API.';

// Tải tệp nhị phân (ảnh QR, PDF) có kèm token đăng nhập. Lỗi trả về theo cùng mẫu với api().
export async function apiBlob(path) {
  if (USE_MOCK) {
    const mock = await import('./mock');
    if (mock.mockHandles('GET', path)) return mock.mockCall('GET', path);
  }
  const token = getToken();
  let res;
  try {
    res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Vui lòng thử lại sau.');
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))).error || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Lỗi máy chủ (${res.status})`, e.details);
  }
  return res.blob();
}
