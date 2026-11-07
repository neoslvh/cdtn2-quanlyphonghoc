import { expect, test } from '@playwright/test';
import { ACCOUNTS, loginAs, runTag } from './support';

// FR-03: nhân viên cơ sở vật chất thêm, sửa phòng và đổi trạng thái; phòng bảo trì không còn trong tra cứu.
test.describe.serial('E2E-05 quản lý phòng (PB-03)', () => {
  const tag = runTag();
  const code = `E${tag}.01.01`;

  test('thêm phòng mới, phòng hiện trong danh sách kèm tòa, cơ sở và trạng thái Sẵn sàng', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.facility.email, '/rooms');
    await page.getByRole('button', { name: 'Thêm phòng' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('A.10.01', { exact: true }).fill(code);
    await dialog.getByRole('spinbutton').fill('45');
    await dialog.getByPlaceholder('Phòng A.10.01', { exact: true }).fill(`Phòng thử ${tag}`);
    await dialog.locator('.ant-form-item').filter({ hasText: 'Cơ sở' }).locator('.ant-select').click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Cơ sở 3' }).click();
    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByText('Đã thêm phòng')).toBeVisible();
    await page.getByPlaceholder('Tìm theo mã hoặc tên phòng').fill(code);
    await page.getByPlaceholder('Tìm theo mã hoặc tên phòng').press('Enter');
    const row = page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: code });
    await expect(row).toContainText('Tòa E' + tag);
    await expect(row).toContainText('Cơ sở 3');
    await expect(row).toContainText('Sẵn sàng');
  });

  test('thêm trùng mã phòng báo lỗi ngay dưới ô mã phòng, thiếu dữ liệu báo từng ô', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.facility.email, '/rooms');
    await page.getByRole('button', { name: 'Thêm phòng' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(dialog.getByText('Nhập mã phòng')).toBeVisible();
    await expect(dialog.getByText('Nhập tên phòng')).toBeVisible();
    await expect(dialog.locator('.ant-form-item-explain-error', { hasText: 'Chọn cơ sở' })).toBeVisible();
    await dialog.getByPlaceholder('A.10.01', { exact: true }).fill('A.10.01');
    await dialog.getByRole('spinbutton').fill('10');
    await dialog.getByPlaceholder('Phòng A.10.01', { exact: true }).fill('Trùng mã');
    await dialog.locator('.ant-form-item').filter({ hasText: 'Cơ sở' }).locator('.ant-select').click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Cơ sở 1' }).click();
    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(dialog.getByText('Mã phòng đã tồn tại.')).toBeVisible();
  });

  test('chuyển phòng sang Bảo trì: mã phòng bị khóa khi sửa, danh sách đổi trạng thái, tra cứu phòng trống không còn phòng đó', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.facility.email, '/rooms');
    await page.getByPlaceholder('Tìm theo mã hoặc tên phòng').fill(code);
    await page.getByPlaceholder('Tìm theo mã hoặc tên phòng').press('Enter');
    const row = page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: code });
    await row.getByRole('button', { name: 'Sửa' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByPlaceholder('A.10.01', { exact: true })).toBeDisabled();
    await dialog.locator('.ant-form-item').filter({ hasText: 'Trạng thái' }).locator('.ant-select').click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Bảo trì' }).click();
    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByText('Đã cập nhật phòng')).toBeVisible();
    await expect(row).toContainText('Bảo trì');
    // Phòng bảo trì không còn trong kết quả tra cứu của người đăng ký.
    const token = await (await request.post('/api/auth/login', { data: { email: ACCOUNTS.requester.email, password: process.env.E2E_PASSWORD || 'Demo@12345' } })).json();
    const from = new Date(Date.now() + 40 * 24 * 3600 * 1000);
    from.setHours(9, 0, 0, 0);
    const to = new Date(from.getTime() + 3600 * 1000);
    const search = await request.get('/api/rooms/available', { headers: { Authorization: `Bearer ${token.token}` }, params: { from: from.toISOString(), to: to.toISOString(), capacity: 10 } });
    expect((await search.json()).items.map((r: { code: string }) => r.code)).not.toContain(code);
  });

  test('lọc theo trạng thái Bảo trì chỉ còn phòng bảo trì', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.admin.email, '/rooms');
    await page.locator('.ant-select').filter({ hasText: 'Mọi trạng thái' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Bảo trì' }).click();
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(rows.first()).toBeVisible();
    for (const r of await rows.all()) await expect(r).toContainText('Bảo trì');
  });
});
