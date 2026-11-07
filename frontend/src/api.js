import { ApiError } from './errors';
import { mockCall, mockHandles } from './mock';

export { ApiError };

const TOKEN_KEY = 'qlphong.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

// Gọi API, tự gắn token và đổi lỗi theo mẫu { error: { code, message, details } } thành ApiError.
// Các API của phòng, yêu cầu, lịch học chưa có ở máy chủ nên chạy trên dữ liệu giả (src/mock). Đặt VITE_API_MOCK=false khi máy chủ đã có.
const USE_MOCK = import.meta.env.VITE_API_MOCK !== 'false';

export async function api(path, { method = 'GET', body } = {}) {
  if (USE_MOCK && mockHandles(method, path)) return mockCall(method, path, body);
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
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Lỗi máy chủ (${res.status})`, e.details);
  }
  return data;
}
