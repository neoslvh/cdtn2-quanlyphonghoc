import { APIRequestContext, expect, test } from '@playwright/test';
import { ACCOUNTS, apiToken, loginAs, runTag, workdaysAhead } from './support';

// SCRUM-19: người đăng ký thấy thông báo khi yêu cầu bị từ chối, đánh dấu đã đọc từng cái và tất cả, số chưa đọc ở thanh trên đổi theo.
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Tạo và gửi một yêu cầu, rồi người duyệt Phòng Đào tạo từ chối kèm lý do để sinh thông báo cho người đăng ký.
async function rejectedRequest(request: APIRequestContext, reason: string, daysAhead: number) {
  const req = auth(await apiToken(request, ACCOUNTS.requester.email));
  const orgs = (await (await request.get('/api/organizations', { headers: req })).json()).items;
  const rooms = (await (await request.get('/api/rooms', { headers: req })).json()).items;
  const d = workdaysAhead(daysAhead);
  const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString();
  const created = await request.post('/api/requests', {
    headers: req,
    data: { organizationId: orgs.find((o: { name: string }) => o.name === 'Khoa Công nghệ thông tin').id, roomId: rooms.find((r: { code: string }) => r.code === 'D.02.01').id, purpose: reason, startAt: at(7), endAt: at(8), participantCount: 30 },
  });
  const r = (await created.json()).request as { id: string; code: string };
  await request.post(`/api/requests/${r.id}/submit`, { headers: req });
  const rejected = await request.post(`/api/requests/${r.id}/reject`, { headers: auth(await apiToken(request, ACCOUNTS.approver.email)), data: { reason } });
  expect(rejected.status()).toBe(200);
  return r;
}
const unread = async (request: APIRequestContext) =>
  (await (await request.get('/api/notifications?pageSize=1', { headers: auth(await apiToken(request, ACCOUNTS.requester.email)) })).json()).unread as number;

test.describe('E2E-09 thông báo (PB-14)', () => {
  test('bị từ chối thì có thông báo kèm lý do, đánh dấu đã đọc làm giảm số chưa đọc ở thanh trên', async ({ page, request }) => {
    const reason = `Trùng sự kiện ${runTag()}`;
    // Bắt đầu từ trạng thái đã đọc hết để số trên thanh trên so sánh được.
    await request.post('/api/notifications/read-all', { headers: auth(await apiToken(request, ACCOUNTS.requester.email)) });
    const r = await rejectedRequest(request, reason, 50);
    expect(await unread(request)).toBe(1);

    await loginAs(page, request, ACCOUNTS.requester.email, '/');
    const bell = page.getByRole('link', { name: 'Thông báo, 1 chưa đọc' });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page).toHaveURL(/\/notifications$/);
    const item = page.locator('.notice').filter({ hasText: reason });
    await expect(item).toContainText('Yêu cầu sử dụng phòng bị từ chối');
    await expect(item).toContainText(`Yêu cầu ${r.code} bị Phòng Đào tạo từ chối: ${reason}`);
    await expect(item.getByText('Mới', { exact: true })).toBeVisible();

    await item.getByRole('button', { name: 'Đánh dấu đã đọc' }).click();
    await expect(item.getByText('Mới', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Thông báo', exact: true })).toBeVisible();
    expect(await unread(request)).toBe(0);

    await item.getByRole('link', { name: 'Xem yêu cầu' }).click();
    await expect(page).toHaveURL(new RegExp(`/requests/${r.id}$`));
    await expect(page.getByText('Từ chối').first()).toBeVisible();
  });

  test('bộ lọc Chưa đọc và nút Đánh dấu tất cả đã đọc', async ({ page, request }) => {
    await request.post('/api/notifications/read-all', { headers: auth(await apiToken(request, ACCOUNTS.requester.email)) });
    const a = await rejectedRequest(request, `Lọc A ${runTag()}`, 51);
    const b = await rejectedRequest(request, `Lọc B ${runTag()}`, 52);
    await loginAs(page, request, ACCOUNTS.requester.email, '/notifications');
    await expect(page.getByRole('heading', { name: 'Thông báo của tôi (2 chưa đọc)' })).toBeVisible();
    await page.getByText('Chưa đọc', { exact: true }).click();
    await expect(page.locator('.notice')).toHaveCount(2);
    await page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click();
    await expect(page.getByText('Không có thông báo chưa đọc')).toBeVisible();
    await page.getByText('Tất cả', { exact: true }).click();
    await expect(page.locator('.notice').filter({ hasText: a.code })).toBeVisible();
    await expect(page.locator('.notice').filter({ hasText: b.code })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toBeDisabled();
    expect(await unread(request)).toBe(0);
  });

  test('thông báo là của riêng từng người: người duyệt không thấy thông báo của người đăng ký', async ({ page, request }) => {
    const reason = `Riêng tư ${runTag()}`;
    await rejectedRequest(request, reason, 53);
    await loginAs(page, request, ACCOUNTS.approver.email, '/notifications');
    await expect(page.getByRole('heading', { name: 'Thông báo' }).first()).toBeVisible();
    await expect(page.getByText(reason)).toHaveCount(0);
    // Người duyệt không có trang chi tiết yêu cầu nên không có liên kết xem yêu cầu.
    await expect(page.getByRole('link', { name: 'Xem yêu cầu' })).toHaveCount(0);
  });
});
