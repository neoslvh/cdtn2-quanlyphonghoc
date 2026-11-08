import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { ACCOUNTS, PASSWORD, apiToken, loginAs, runTag, workdaysAhead } from './support';

// SCRUM-18, SCRUM-13: người duyệt xử lý yêu cầu theo chuỗi đơn vị, từ chối phải có lý do, bước cuối kiểm tra lại phòng.
// Dữ liệu mẫu chỉ có người duyệt của Phòng Đào tạo, nên test tạo thêm người duyệt của Phòng Quản trị cơ sở vật chất bằng API quản trị.
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const slots = new Set<string>();

// Khung giờ ngẫu nhiên rất xa để các lần chạy sau không đụng lượt đặt đã duyệt của lần chạy trước.
function uniqueSlot() {
  for (;;) {
    const d = workdaysAhead(120 + Math.floor(Math.random() * 1500));
    const hour = 7 + Math.floor(Math.random() * 12);
    const key = `${d.toDateString()}-${hour}`;
    if (!slots.has(key)) {
      slots.add(key);
      return { d, hour };
    }
  }
}

async function submitted(request: APIRequestContext, purpose: string, slot = uniqueSlot()) {
  const headers = auth(await apiToken(request, ACCOUNTS.requester.email));
  const orgs = (await (await request.get('/api/organizations', { headers })).json()).items;
  const rooms = (await (await request.get('/api/rooms', { headers })).json()).items;
  const at = (h: number) => new Date(slot.d.getFullYear(), slot.d.getMonth(), slot.d.getDate(), h).toISOString();
  const created = await request.post('/api/requests', {
    headers,
    data: { organizationId: orgs.find((o: { name: string }) => o.name === 'Khoa Công nghệ thông tin').id, roomId: rooms.find((r: { code: string }) => r.code === 'D.02.01').id, purpose, startAt: at(slot.hour), endAt: at(slot.hour + 1), participantCount: 30 },
  });
  expect(created.status()).toBe(201);
  const r = (await created.json()).request as { id: string; code: string };
  expect((await request.post(`/api/requests/${r.id}/submit`, { headers })).status()).toBe(200);
  return r;
}

// Tạo người duyệt của Phòng Quản trị cơ sở vật chất, đặt mật khẩu theo PASSWORD để dùng chung hàm đăng nhập.
async function facilityApprover(request: APIRequestContext) {
  const admin = auth(await apiToken(request, ACCOUNTS.admin.email));
  const orgs = (await (await request.get('/api/organizations?scope=all', { headers: admin })).json()).items;
  const email = `csvc.duyet.${runTag()}${Math.floor(Math.random() * 1000)}@qlphong.local`;
  const res = await request.post('/api/users', { headers: admin, data: { fullName: 'Người duyệt cơ sở vật chất', email, organizationId: orgs.find((o: { name: string }) => o.name === 'Phòng Quản trị cơ sở vật chất').id, role: 'APPROVER' } });
  expect(res.status()).toBe(201);
  const temp = (await res.json()).temporaryPassword;
  const first = (await (await request.post('/api/auth/login', { data: { email, password: temp } })).json()).token;
  expect((await request.post('/api/auth/change-password', { headers: auth(first), data: { currentPassword: temp, newPassword: PASSWORD } })).status()).toBe(200);
  return email;
}

const row = (page: Page, code: string) => page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: code });

// Hàng chờ xếp cũ trước và có thể đã dài hơn một trang, nên lật trang đến khi thấy phiếu.
async function openRequest(page: Page, code: string) {
  const loaded = async () => {
    await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
    await page.locator('.ant-table-tbody tr.ant-table-row, .ant-table-placeholder').first().waitFor();
  };
  await loaded();
  for (let i = 0; i < 50 && !(await row(page, code).count()); i++) {
    const next = page.locator('.ant-pagination-next');
    if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true') break;
    await next.click();
    await loaded();
  }
  await row(page, code).getByRole('button', { name: 'Xem và xử lý' }).click();
}
const status = async (request: APIRequestContext, id: string) =>
  (await (await request.get(`/api/requests/${id}`, { headers: auth(await apiToken(request, ACCOUNTS.requester.email)) })).json()).request;

test.describe('E2E-08 duyệt yêu cầu (PB-13, PB-08)', () => {
  test('hai đơn vị duyệt lần lượt: yêu cầu chuyển bước rồi thành Đã duyệt, người đăng ký nhận thông báo', async ({ page, request }) => {
    const r = await submitted(request, `Duyệt hai bước ${runTag()}`);
    const csvc = await facilityApprover(request);

    await loginAs(page, request, ACCOUNTS.approver.email, '/approvals');
    await openRequest(page, r.code);
    await expect(page.getByText('Đang chờ Phòng Đào tạo')).toBeVisible();
    await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await page.locator('.ant-modal').getByRole('button', { name: 'Đồng ý duyệt' }).click();
    await expect(page.getByText(`Đã đồng ý ${r.code}`)).toBeVisible();
    expect((await status(request, r.id)).steps.map((s: { status: string }) => s.status)).toEqual(['APPROVED', 'PENDING']);

    // Người duyệt của đơn vị khác chỉ thấy phiếu khi tới lượt đơn vị mình, và bước cuối có nhắc kiểm tra lại.
    await loginAs(page, request, csvc, '/approvals');
    await openRequest(page, r.code);
    await expect(page.getByText('Bước cuối', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(page.getByText(/kiểm tra lại phòng, lịch học chính khóa/)).toBeVisible();
    await page.locator('.ant-modal').getByRole('button', { name: 'Đồng ý duyệt' }).click();
    await expect(page.getByText(`Đã đồng ý ${r.code}`)).toBeVisible();
    expect((await status(request, r.id)).status).toBe('APPROVED');

    const inbox = await (await request.get('/api/notifications', { headers: auth(await apiToken(request, ACCOUNTS.requester.email)) })).json();
    expect(inbox.items.some((n: { requestId: string; title: string }) => n.requestId === r.id && n.title.includes('đã được duyệt'))).toBe(true);
  });

  test('từ chối bắt buộc có lý do; từ chối xong phiếu thành Từ chối và các bước sau bị hủy', async ({ page, request }) => {
    const r = await submitted(request, `Từ chối ${runTag()}`);
    await loginAs(page, request, ACCOUNTS.approver.email, '/approvals');
    await openRequest(page, r.code);
    await page.getByRole('button', { name: 'Từ chối', exact: true }).click();
    await page.locator('.ant-modal').getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(page.getByText('Nhập lý do từ chối')).toBeVisible();
    expect((await status(request, r.id)).status).toBe('PENDING');
    await page.getByLabel('Lý do từ chối').fill('Trùng sự kiện của trường');
    await page.locator('.ant-modal').getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(page.getByText(`Đã từ chối ${r.code}`)).toBeVisible();
    const after = await status(request, r.id);
    expect([after.status, after.steps.map((s: { status: string }) => s.status)]).toEqual(['REJECTED', ['REJECTED', 'CANCELLED']]);
    const inbox = await (await request.get('/api/notifications', { headers: auth(await apiToken(request, ACCOUNTS.requester.email)) })).json();
    expect(inbox.items.find((n: { requestId: string }) => n.requestId === r.id).message).toContain('Trùng sự kiện của trường');
  });

  test('hai phiếu cùng phòng cùng giờ: phiếu duyệt sau bị chặn ở bước cuối và nêu mã phiếu đã duyệt', async ({ page, request }) => {
    const slot = uniqueSlot();
    const a = await submitted(request, `Trùng A ${runTag()}`, slot);
    const b = await submitted(request, `Trùng B ${runTag()}`, slot);
    const csvc = await facilityApprover(request);
    const approve = async (who: string, code: string) => {
      await loginAs(page, request, who, '/approvals');
      await openRequest(page, code);
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await page.locator('.ant-modal').getByRole('button', { name: 'Đồng ý duyệt' }).click();
    };
    await approve(ACCOUNTS.approver.email, a.code);
    await expect(page.getByText(`Đã đồng ý ${a.code}`)).toBeVisible();
    await approve(ACCOUNTS.approver.email, b.code);
    await expect(page.getByText(`Đã đồng ý ${b.code}`)).toBeVisible();
    await approve(csvc, a.code);
    await expect(page.getByText(`Đã đồng ý ${a.code}`)).toBeVisible();

    await approve(csvc, b.code);
    await expect(page.getByText(new RegExp(`Lượt đặt đã duyệt ${a.code}`))).toBeVisible();
    await expect(page.getByText(/đã có lượt đặt được duyệt trong khung giờ này nên không thể duyệt/)).toBeVisible();
    expect((await status(request, b.id)).status).toBe('PENDING');
  });

  test('chỉ người duyệt vào được trang duyệt; người đăng ký và quản trị viên bị chuyển về trang chủ', async ({ page, request }) => {
    for (const email of [ACCOUNTS.requester.email, ACCOUNTS.admin.email, ACCOUNTS.facility.email]) {
      await loginAs(page, request, email, '/approvals');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('link', { name: 'Duyệt yêu cầu' })).toHaveCount(0);
    }
    await loginAs(page, request, ACCOUNTS.approver.email, '/');
    await expect(page.getByRole('link', { name: 'Duyệt yêu cầu' }).first()).toBeVisible();
  });
});
