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

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Tạo (và tùy chọn gửi) một phiếu của người đăng ký mẫu qua API. Giờ tính theo giờ máy, ngày cách hôm nay daysAhead ngày làm việc. */
export async function createRequest(
  request: APIRequestContext,
  { purpose, daysAhead, hour, hours = 1, room = 'D.02.01', participantCount = 30, submit = true }: { purpose: string; daysAhead: number; hour: number; hours?: number; room?: string; participantCount?: number; submit?: boolean },
) {
  const headers = bearer(await apiToken(request, ACCOUNTS.requester.email));
  const orgs = (await (await request.get('/api/organizations', { headers })).json()).items;
  const rooms = (await (await request.get('/api/rooms', { headers })).json()).items;
  const d = workdaysAhead(daysAhead);
  const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString();
  const res = await request.post('/api/requests', {
    headers,
    data: { organizationId: orgs.find((o: { name: string }) => o.name === 'Khoa Công nghệ thông tin').id, roomId: rooms.find((r: { code: string }) => r.code === room).id, purpose, startAt: at(hour), endAt: at(hour + hours), participantCount },
  });
  if (res.status() !== 201) throw new Error(`Tạo phiếu thất bại: ${res.status()} ${await res.text()}`);
  const r = (await res.json()).request as { id: string; code: string; steps: { organizationName: string; status: string }[] };
  if (!submit) return r;
  const sent = await request.post(`/api/requests/${r.id}/submit`, { headers });
  if (sent.status() !== 200) throw new Error(`Gửi phiếu thất bại: ${sent.status()} ${await sent.text()}`);
  return { ...r, ...(await sent.json()).request } as typeof r;
}

/** Tạo tài khoản người duyệt của một đơn vị bằng API quản trị, đặt mật khẩu theo PASSWORD. Trả về email. */
export async function createApprover(request: APIRequestContext, orgName: string) {
  const admin = bearer(await apiToken(request, ACCOUNTS.admin.email));
  const orgs = (await (await request.get('/api/organizations?scope=all', { headers: admin })).json()).items;
  const email = `duyet.${runTag()}${Math.floor(Math.random() * 1000)}@qlphong.local`;
  const res = await request.post('/api/users', { headers: admin, data: { fullName: `Người duyệt ${orgName}`, email, organizationId: orgs.find((o: { name: string }) => o.name === orgName).id, role: 'APPROVER' } });
  if (res.status() !== 201) throw new Error(`Tạo người duyệt thất bại: ${res.status()}`);
  const temp = (await res.json()).temporaryPassword;
  const first = (await (await request.post('/api/auth/login', { data: { email, password: temp } })).json()).token;
  await request.post('/api/auth/change-password', { headers: bearer(first), data: { currentPassword: temp, newPassword: PASSWORD } });
  return email;
}

/** Duyệt hết các bước của một phiếu qua API: Phòng Đào tạo bằng tài khoản mẫu, bước cuối bằng người duyệt cơ sở vật chất. */
export async function approveAll(request: APIRequestContext, id: string, facilityEmail: string) {
  for (const email of [ACCOUNTS.approver.email, facilityEmail]) {
    const res = await request.post(`/api/requests/${id}/approve`, { headers: bearer(await apiToken(request, email)), data: {} });
    if (res.status() !== 200) throw new Error(`Duyệt thất bại: ${res.status()} ${await res.text()}`);
  }
}
