import { expect, test } from '@playwright/test';
import { ACCOUNTS, approveAll, cleanupCreated, createApprover, createRequest, loginAs, runTag } from './support';

// E2E-16: bàn giao và nhận trả phòng (SCRUM-22, TC-FR17-01, TC-FR17-02) trên hệ thống thật.
test.describe('E2E-16 bàn giao và nhận trả', () => {
  test.afterAll(async ({ request }) => cleanupCreated(request));

  test('nhân viên cơ sở vật chất bàn giao rồi nhận trả; người đăng ký xem lại biên bản kèm danh sách thiết bị', async ({ page, request }) => {
    const facility = await createApprover(request, 'Phòng Quản trị cơ sở vật chất');
    const r = await createRequest(request, { purpose: `Bàn giao ${runTag()}`, daysAhead: 150 + Math.floor(Math.random() * 1200), hour: 7 + Math.floor(Math.random() * 12), room: 'A.10.02' });
    await approveAll(request, r.id, facility);

    await loginAs(page, request, ACCOUNTS.facility.email, '/facility');
    await expect(page.getByText('Máy chủ chưa cho nhân viên cơ sở vật chất')).toHaveCount(0);
    // Tìm dòng của phiếu qua các trang danh sách đã duyệt.
    const row = page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: r.code });
    await expect(async () => {
      if (await row.count()) return;
      await page.locator('.ant-pagination-next').first().click();
      expect(await row.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 30_000 });
    await expect(row).toContainText('Chưa bàn giao');

    await row.getByRole('button', { name: 'Bàn giao' }).click();
    const modal = page.locator('.ant-modal');
    await modal.getByLabel('Tình trạng phòng khi bàn giao').fill('Phòng sạch, đủ bàn ghế');
    await modal.getByRole('button', { name: 'Xác nhận bàn giao' }).click();
    await expect(page.getByText(`Đã bàn giao ${r.code}`)).toBeVisible();
    await expect(row).toContainText('Đang sử dụng từ');

    await row.getByRole('button', { name: 'Nhận trả' }).click();
    await page.locator('.ant-modal').getByLabel('Tình trạng phòng và thiết bị sau sử dụng').fill('Trả đủ, máy chiếu tốt');
    await page.locator('.ant-modal').getByRole('button', { name: 'Xác nhận nhận trả' }).click();
    await expect(page.getByText(`Đã nhận trả ${r.code}`)).toBeVisible();
    await expect(row).toContainText('Đã nhận trả');
    await expect(row.getByRole('button')).toHaveCount(0);

    await loginAs(page, request, ACCOUNTS.requester.email, `/requests/${r.id}`);
    const usage = page.locator('.panel').filter({ hasText: 'Sử dụng phòng' });
    await expect(usage).toContainText('Nhân viên cơ sở vật chất');
    await expect(usage).toContainText('Phòng sạch, đủ bàn ghế');
    await expect(usage).toContainText('Trả đủ, máy chiếu tốt');
    await expect(usage.getByText('Thiết bị lúc bàn giao')).toBeVisible();
    await expect(usage.getByText('Thiết bị lúc nhận trả')).toBeVisible();
  });
});
