import { APIRequestContext, Page } from '@playwright/test';

// Tài khoản mẫu do seed tạo, mật khẩu theo SEED_PASSWORD (mặc định của docker compose).
export const PASSWORD = process.env.E2E_PASSWORD || 'Demo@12345';
export const ACCOUNTS = {
  requester: { email: 'sv01@qlphong.local', role: 'Người đăng ký' },
  approver: { email: 'daotao@qlphong.local', role: 'Người duyệt' },
  facility: { email: 'csvc@qlphong.local', role: 'Nhân viên cơ sở vật chất' },
  admin: { email: 'admin@qlphong.local', role: 'Quản trị viên' },
} as const;

/** Đăng nhập qua API rồi đặt token vào trình duyệt, nhanh hơn đăng nhập bằng giao diện ở mỗi test. */
export async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post('/api/auth/login', { data: { email, password: PASSWORD } });
  if (!res.ok()) throw new Error(`Đăng nhập ${email} thất bại: ${res.status()}`);
  return (await res.json()).token;
}

export async function loginAs(page: Page, request: APIRequestContext, email: string, path = '/') {
  const token = await apiToken(request, email);
  await page.addInitScript((t) => localStorage.setItem('qlphong.token', t), token);
  await page.goto(path);
}

/** Ngày làm việc cách hôm nay n ngày làm việc, lúc 00:00 giờ máy. */
export function workdaysAhead(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; ) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) i++;
  }
  return d;
}

const p2 = (n: number) => String(n).padStart(2, '0');
export const dmy = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
export const stamp = (d: Date, hh: number, mm = 0) => `${dmy(d)} ${p2(hh)}:${p2(mm)}`;

/** Nhập khoảng giờ vào ô chọn ngày giờ của Ant Design: gõ ngày giờ bắt đầu, Enter, gõ ngày giờ kết thúc, Enter. */
export async function pickRange(page: Page, from: string, to: string) {
  const inputs = page.locator('.ant-picker-range input');
  await inputs.nth(0).click();
  await inputs.nth(0).fill(from);
  await inputs.nth(0).press('Enter');
  await inputs.nth(1).fill(to);
  await inputs.nth(1).press('Enter');
}

/** Mã duy nhất cho mỗi lần chạy, để dữ liệu tạo ra không đụng nhau giữa các lần chạy. */
export const runTag = () => Date.now().toString(36).toUpperCase().slice(-5);
