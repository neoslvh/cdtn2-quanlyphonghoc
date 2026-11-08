import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const CHANGED = 'notifications:changed';
const REFRESH_MS = 30000;

// Báo cho thanh trên tải lại số thông báo chưa đọc sau khi đánh dấu đã đọc.
export const notifyChanged = () => window.dispatchEvent(new Event(CHANGED));

// Số thông báo chưa đọc của người đang đăng nhập (FR-14). Tải lại định kỳ và khi có sự kiện đổi từ trang thông báo.
export function useUnreadCount() {
  const [unread, setUnread] = useState(0);
  const refresh = useCallback(() => {
    api('/notifications?page=1&pageSize=1').then((d) => setUnread(d.unread)).catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener(CHANGED, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CHANGED, refresh);
    };
  }, [refresh]);
  return unread;
}
