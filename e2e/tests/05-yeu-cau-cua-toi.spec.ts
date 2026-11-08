import { APIRequestContext, expect, test } from '@playwright/test';
import { ACCOUNTS, apiToken, loginAs, runTag, workdaysAhead } from './support';

// SCRUM-14, SCRUM-15: danh sách, chi tiết, sửa nháp, gửi và hủy yêu cầu của người đăng ký.
async function newDraft(request: APIRequestContext, purpose: string, daysAhead: number, hour: number) {
  const token = await apiToken(request, ACCOUNTS.requester.email);
  const headers = { Authorization: `Bearer ${token}` };
  const orgs = (await (await request.get('/api/organizations', { headers })).json()).items;
  const rooms = (await (await request.get('/api/rooms', { headers })).json()).items;
  const d = workdaysAhead(daysAhead);
  const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString();
  const res = await request.post('/api/requests', {
    headers,
    data: {
      organizationId: orgs.find((o: { name: string }) => o.name === 'Khoa Công nghệ thông tin').id,
      roomId: rooms.find((r: { code: string }) => r.code === 'D.02.01').id,
      purpose,
      startAt: at(hour),
      endAt: at(hour + 1),
      participantCount: 30,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).request as { id: string; code: string };
}

test.describe('E2E-07 yêu cầu của tôi (PB-09, PB-10)', () => {
  test('danh sách có yêu cầu vừa tạo, lọc theo trạng thái và mở chi tiết', async ({ page, request }) => {
    const tag = runTag();
    const r = await newDraft(request, `Danh sách ${tag}`, 40, 7);
    await loginAs(page, request, ACCOUNTS.requester.email, '/requests');
    const row = page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: r.code });
    await expect(row).toContainText('Nháp');
    await expect(row).toContainText('D.02.01');
    await page.locator('.ant-select').filter({ hasText: 'Mọi trạng thái' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Từ chối' }).click();
    await expect(page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: r.code })).toHaveCount(0);
    await page.locator('.ant-select').first().click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Nháp' }).click();
    await page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: r.code }).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/requests/${r.id}$`));
    await expect(page.getByRole('heading', { name: `Yêu cầu ${r.code}` })).toBeVisible();
    await expect(page.getByText('Yêu cầu chưa được gửi nên chưa có bước duyệt.')).toBeVisible();
  });

  test('sửa nháp rồi gửi: mục đích mới được lưu, tiến độ hiện hai đơn vị duyệt', async ({ page, request }) => {
    const tag = runTag();
    const r = await newDraft(request, `Trước khi sửa ${tag}`, 41, 7);
    await loginAs(page, request, ACCOUNTS.requester.email, `/requests/${r.id}`);
    await page.getByRole('button', { name: 'Sửa', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/requests/${r.id}/edit$`));
    await expect(page.getByRole('heading', { name: `Sửa phiếu ${r.code}` })).toBeVisible();
    await expect(page.getByPlaceholder(/Sinh hoạt chuyên đề/)).toHaveValue(`Trước khi sửa ${tag}`);
    await page.getByPlaceholder(/Sinh hoạt chuyên đề/).fill(`Sau khi sửa ${tag}`);
    await page.getByRole('button', { name: 'Lưu nháp' }).click();
    await expect(page.getByText(`Đã lưu nháp ${r.code}`)).toBeVisible();
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
    await expect(page.getByText(`Đã gửi yêu cầu ${r.code}`)).toBeVisible();
    await page.getByRole('button', { name: 'Xem yêu cầu' }).click();
    await expect(page.getByText(`Sau khi sửa ${tag}`)).toBeVisible();
    await expect(page.locator('.ant-steps')).toContainText('Phòng Đào tạo');
    await expect(page.locator('.ant-steps')).toContainText('Phòng Quản trị cơ sở vật chất');
    // Đã gửi thì không còn nút Sửa, chỉ còn Hủy.
    await expect(page.getByRole('button', { name: 'Sửa', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hủy yêu cầu' })).toBeVisible();
  });

  test('vào trang sửa của phiếu đã gửi thì chuyển về chi tiết', async ({ page, request }) => {
    const r = await newDraft(request, `Đã gửi ${runTag()}`, 42, 7);
    const token = await apiToken(request, ACCOUNTS.requester.email);
    expect((await request.post(`/api/requests/${r.id}/submit`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);
    await loginAs(page, request, ACCOUNTS.requester.email, `/requests/${r.id}/edit`);
    await expect(page).toHaveURL(new RegExp(`/requests/${r.id}$`));
  });

  test('hủy yêu cầu đang duyệt kèm lý do: trạng thái Đã hủy, lý do hiện trên trang, các bước bị hủy', async ({ page, request }) => {
    const r = await newDraft(request, `Hủy ${runTag()}`, 43, 7);
    const token = await apiToken(request, ACCOUNTS.requester.email);
    await request.post(`/api/requests/${r.id}/submit`, { headers: { Authorization: `Bearer ${token}` } });
    await loginAs(page, request, ACCOUNTS.requester.email, `/requests/${r.id}`);
    await expect(page.getByText('Đang duyệt').first()).toBeVisible();
    await page.getByRole('button', { name: 'Hủy yêu cầu' }).click();
    await page.getByLabel('Lý do hủy').fill('Đổi kế hoạch');
    await page.getByRole('dialog').getByRole('button', { name: 'Hủy yêu cầu' }).click();
    await expect(page.getByText(`Đã hủy yêu cầu ${r.code}`)).toBeVisible();
    await expect(page.getByText('Lý do hủy: Đổi kế hoạch')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hủy yêu cầu' })).toHaveCount(0);
  });

  test('người duyệt không vào được chi tiết yêu cầu và không có mục Yêu cầu của tôi', async ({ page, request }) => {
    const r = await newDraft(request, `Riêng tư ${runTag()}`, 44, 7);
    await loginAs(page, request, ACCOUNTS.approver.email, `/requests/${r.id}`);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Yêu cầu của tôi' })).toHaveCount(0);
  });

  test('quản trị viên xem tất cả yêu cầu nhưng không có nút sửa hay hủy', async ({ page, request }) => {
    const r = await newDraft(request, `Admin xem ${runTag()}`, 45, 7);
    await loginAs(page, request, ACCOUNTS.admin.email, '/requests');
    await expect(page.getByRole('heading', { name: 'Tất cả yêu cầu' })).toBeVisible();
    await page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: r.code }).getByRole('link').click();
    await expect(page.getByRole('heading', { name: `Yêu cầu ${r.code}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sửa', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hủy yêu cầu' })).toHaveCount(0);
  });
});
