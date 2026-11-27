import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SESSION_EXPIRED, api, getToken, setToken } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  // Khôi phục phiên khi tải lại trang. Token hết hạn hoặc bị thu hồi thì xóa đi.
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // API báo phiên hết hạn thì bỏ người dùng hiện tại; trang được bảo vệ tự chuyển về đăng nhập và báo lý do.
  useEffect(() => {
    // Sự kiện chỉ phát khi đang có token, nên ghi cờ ngay ở đây rồi mới bỏ người dùng (hàm cập nhật state giữ thuần túy).
    const expire = () => {
      sessionStorage.setItem(SESSION_EXPIRED, '1');
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED, expire);
    return () => window.removeEventListener(SESSION_EXPIRED, expire);
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(d.token);
    setUser(d.user);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, setUser, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Cấu hình công khai của máy chủ, hiện chỉ cho biết có mở đăng ký tự do hay không.
export function useServerConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    api('/auth/config').then(setConfig).catch(() => setConfig({ selfRegistration: false }));
  }, []);
  return config;
}
