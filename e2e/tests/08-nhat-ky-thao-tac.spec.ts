import { APIRequestContext, expect, test } from '@playwright/test';
import { ACCOUNTS, apiToken, loginAs, runTag, workdaysAhead } from './support';

// SCRUM-26: quản trị viên tra cứu nhật ký thao tác theo đối tượng, hành động, người thực hiện và xem giá trị trước, sau.
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Tạo, gửi rồi từ chối một yêu cầu để có ba bản ghi nhật ký gắn với cùng một mã yêu cầu.
async function rejectedRequest(request: APIRequestContext, reason: string, daysAhead: number) {
  const req = auth(await apiToken(request, ACCOUNTS.requester.email));
  const orgs = (await (await request.get('/api/organizations', { headers: req })).json()).items;
  const rooms = (await (await request.get('/api/rooms', { headers: req })).json()).items;
  const d = workdaysAhead(daysAhead);
  const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString();
  const created = await request.post('/api/requests', {
    headers: req,
    data: { organizationId: orgs.find((o: { name: string }) => o.name === 'Khoa Công nghệ thông tin').id, roomId: rooms.find((r: { code: string }) => r.code === 'D.02.01').id, purpose: reason, startAt: at(9), endAt: at(10), participantCount: 30 },
  });
  const r = (await created.json()).request as { id: string; code: string };
  await request.post(`/api/requests/${r.id}/submit`, { headers: req });
  expect((await request.post(`/api/requests/${r.id}/reject`, { headers: auth(await apiToken(request, ACCOUNTS.approver.email)), data: { reason } })).status()).toBe(200);
  return r;
}

test.describe('E2E-10 nhật ký thao tác (PB-21)', () => {
  test('tra cứu theo mã đối tượng: đủ ba bước, người thực hiện đúng, mở rộng dòng thấy lý do từ chối', async ({ page, request }) => {
    const reason = `Trùng sự kiện ${runTag()}`;
    const r = await rejectedRequest(request, reason, 60);
    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/audit');
    await page.getByPlaceholder('Mã đối tượng (UUID)').fill(r.id);
    await page.getByPlaceholder('Mã đối tượng (UUID)').press('Enter');
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: 'Tạo yêu cầu' })).toContainText('Người đăng ký mẫu');
    await expect(rows.filter({ hasText: 'Gửi yêu cầu' })).toContainText('Người đăng ký mẫu');
    const rejected = rows.filter({ hasText: 'Từ chối yêu cầu' });
    await expect(rejected).toContainText('Cán bộ Phòng Đào tạo');
    await expect(rejected).toContainText('Yêu cầu');
    await rejected.locator('.ant-table-row-expand-icon').click();
    await expect(page.locator('.audit-diff')).toContainText(reason);
    await expect(page.locator('.audit-diff')).toContainText('REJECTED');
  });

  test('lọc theo hành động, rồi thêm lọc theo người thực hiện', async ({ page, request }) => {
    await rejectedRequest(request, `Lọc ${runTag()}`, 61);
    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/audit');
    await page.locator('.ant-select').filter({ hasText: 'Mọi hành động' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Từ chối yêu cầu' }).click();
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.allInnerTexts()) expect(text).toContain('Từ chối yêu cầu');

    // Danh sách người dùng dài và cuộn ảo, nên gõ tên để tìm như người dùng thật.
    await page.getByRole('combobox', { name: 'Người thực hiện' }).fill('Cán bộ Phòng Đào tạo');
    await page.locator('.ant-select-item-option').filter({ hasText: 'Cán bộ Phòng Đào tạo' }).click();
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.allInnerTexts()) {
      expect(text).toContain('Từ chối yêu cầu');
      expect(text).toContain('Cán bộ Phòng Đào tạo');
    }
  });

  test('lọc theo người thực hiện: mọi dòng đều của người đó', async ({ page, request }) => {
    await rejectedRequest(request, `Người ${runTag()}`, 62);
    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/audit');
    // Danh sách người dùng dài và cuộn ảo, nên gõ tên để tìm như người dùng thật.
    await page.getByRole('combobox', { name: 'Người thực hiện' }).fill('Người đăng ký mẫu');
    await page.locator('.ant-select-item-option').filter({ hasText: 'Người đăng ký mẫu' }).click();
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.allInnerTexts()) expect(text).toContain('Người đăng ký mẫu');
  });

  test('mã đối tượng sai định dạng báo lỗi ngay dưới ô nhập, không gọi máy chủ', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/audit');
    await expect(page.locator('.ant-table-tbody tr.ant-table-row').first()).toBeVisible();
    await page.getByPlaceholder('Mã đối tượng (UUID)').fill('abc');
    await page.getByPlaceholder('Mã đối tượng (UUID)').press('Enter');
    await expect(page.getByText('Mã đối tượng phải là UUID')).toBeVisible();
  });

  test('mã đối tượng không có bản ghi thì hiện bảng rỗng', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/audit');
    await page.getByPlaceholder('Mã đối tượng (UUID)').fill('00000000-0000-4000-8000-000000000001');
    await page.getByPlaceholder('Mã đối tượng (UUID)').press('Enter');
    await expect(page.getByText('Không có bản ghi nào')).toBeVisible();
  });

  test('chỉ quản trị viên xem được: API trả 403 cho người đăng ký và người duyệt', async ({ request }) => {
    for (const email of [ACCOUNTS.requester.email, ACCOUNTS.approver.email, ACCOUNTS.facility.email]) {
      expect((await request.get('/api/audit-logs', { headers: auth(await apiToken(request, email)) })).status()).toBe(403);
    }
  });
});
