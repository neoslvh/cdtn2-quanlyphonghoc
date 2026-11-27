import { APIRequestContext, expect, test } from '@playwright/test';
import { ACCOUNTS, apiToken, approveAll, createApprover, createRequest, loginAs, runTag, workdaysAhead } from './support';

// Hoàn thiện giao diện trên hệ thống thật: Tổng quan, trang 404, tìm tài khoản, kiểm tra trước khi duyệt, in phiếu,
// menu trên điện thoại, và các trang đã có giao diện nhưng máy chủ chưa có API phải báo rõ thay vì lỗi.
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function submitted(request: APIRequestContext, purpose: string, daysAhead: number) {
  const headers = auth(await apiToken(request, ACCOUNTS.requester.email));
  const orgs = (await (await request.get('/api/organizations', { headers })).json()).items;
  const rooms = (await (await request.get('/api/rooms', { headers })).json()).items;
  const d = workdaysAhead(daysAhead);
  const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString();
  const res = await request.post('/api/requests', {
    headers,
    data: { organizationId: orgs.find((o: { name: string }) => o.name === 'Khoa Công nghệ thông tin').id, roomId: rooms.find((r: { code: string }) => r.code === 'D.02.01').id, purpose, startAt: at(15), endAt: at(16), participantCount: 30 },
  });
  const r = (await res.json()).request as { id: string; code: string };
  expect((await request.post(`/api/requests/${r.id}/submit`, { headers })).status()).toBe(200);
  return r;
}

test.describe('E2E-11 hoàn thiện giao diện (Plan 2)', () => {
  test('Tổng quan của người đăng ký có số liệu nhanh, bấm Đang duyệt mở danh sách đã lọc sẵn', async ({ page, request }) => {
    await submitted(request, `Tổng quan ${runTag()}`, 70);
    await loginAs(page, request, ACCOUNTS.requester.email, '/');
    const card = page.locator('.stat-card').filter({ hasText: 'Đang duyệt' });
    await expect(card.locator('.stat-value')).toHaveText(/^\d+$/);
    await card.click();
    await expect(page).toHaveURL(/\/requests\?status=PENDING$/);
    await expect(page.locator('.ant-select').first()).toContainText('Đang duyệt');
    for (const text of await page.locator('.ant-table-tbody tr.ant-table-row').allInnerTexts()) expect(text).toContain('Đang duyệt');
  });

  test('đường dẫn không tồn tại hiện trang 404 kèm nút về trang chủ, vẫn giữ menu', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/khong-co-trang-nay');
    await expect(page.getByText('Không tìm thấy trang')).toBeVisible();
    await expect(page.locator('.app-top nav')).toBeVisible();
    await page.getByRole('button', { name: 'Về trang chủ' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('trang Tài khoản tìm theo tên hoặc email và lọc theo vai trò', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/users');
    await page.getByPlaceholder('Tìm theo tên hoặc email').fill('daotao@qlphong');
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Cán bộ Phòng Đào tạo');
    await page.getByPlaceholder('Tìm theo tên hoặc email').fill('');
    await page.getByRole('combobox', { name: 'Lọc theo vai trò' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Quản trị viên' }).click();
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.allInnerTexts()) expect(text).toContain('Quản trị viên');
  });

  test('ngăn duyệt có khối kiểm tra trước khi xác nhận: phòng còn trống, sức chứa, quy mô', async ({ page, request }) => {
    const r = await submitted(request, `Kiểm tra trước ${runTag()}`, 71);
    await loginAs(page, request, ACCOUNTS.approver.email, '/approvals');
    const next = page.locator('.ant-pagination-next');
    for (let i = 0; i < 50 && !(await page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: r.code }).count()); i++) {
      await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
      if (await page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: r.code }).count()) break;
      if ((await next.getAttribute('aria-disabled')) === 'true') break;
      await next.click();
    }
    await page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: r.code }).getByRole('button', { name: 'Xem và xử lý' }).click();
    const check = page.getByLabel('Kiểm tra trước khi xác nhận');
    await expect(check).toContainText('Phòng D.02.01 còn trống trong khung giờ này.');
    await expect(check).toContainText('30 người, phòng có 90 chỗ.');
    await expect(check).toContainText('Quy mô dưới 200 người.');
  });

  test('TC-FR15-01 phiếu đang duyệt chưa in được, phiếu đã duyệt có nút In phiếu mở hộp thoại in', async ({ page, request }) => {
    const pending = await submitted(request, `Chưa in ${runTag()}`, 72);
    await loginAs(page, request, ACCOUNTS.requester.email, `/requests/${pending.id}`);
    await expect(page.getByRole('heading', { name: `Yêu cầu ${pending.code}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In phiếu / Lưu PDF' })).toHaveCount(0);

    const facility = await createApprover(request, 'Phòng Quản trị cơ sở vật chất');
    const done = await createRequest(request, { purpose: `In phiếu ${runTag()}`, daysAhead: 150 + Math.floor(Math.random() * 1200), hour: 7 + Math.floor(Math.random() * 12), room: 'A.10.02' });
    await approveAll(request, done.id, facility);
    await page.goto(`/requests/${done.id}`);
    await page.evaluate(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed += 1; }; });
    await page.getByRole('button', { name: 'In phiếu / Lưu PDF' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  });
  test('trên điện thoại menu cuộn ngang, trang không bị tràn chiều ngang', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAs(page, request, ACCOUNTS.admin.email, '/');
    await expect(page.locator('.app-top nav a').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const nav = await page.locator('.app-top nav').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(nav.scroll).toBeGreaterThan(nav.client);
  });
});

test.describe('E2E-12 trang chờ API (Plan 3) trên máy chủ chưa có API', () => {
  // Khi backend làm xong các API này, đổi các ca dưới đây sang kiểm tra dữ liệu thật.
  const pending = [
    { who: ACCOUNTS.facility.email, path: '/equipment', text: 'Chức năng quản lý thiết bị chưa có API ở máy chủ' },
    { who: ACCOUNTS.admin.email, path: '/admin/reports', text: 'Chức năng báo cáo thống kê chưa có API ở máy chủ' },
    { who: ACCOUNTS.admin.email, path: '/admin/approval-rules', text: 'Chức năng cấu hình quy tắc duyệt chưa có API ở máy chủ' },
  ];
  for (const p of pending) {
    test(`${p.path} báo chưa có API thay vì lỗi`, async ({ page, request }) => {
      await loginAs(page, request, p.who, p.path);
      await expect(page.getByText(p.text)).toBeVisible();
      await expect(page.getByText(/Lỗi máy chủ|Không tìm thấy API\./)).toHaveCount(0);
    });
  }

  test('Bàn giao và báo hỏng: nhân viên cơ sở vật chất thấy hướng dẫn mở quyền, tab báo hỏng báo chưa có API', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.facility.email, '/facility');
    await expect(page.getByText('Máy chủ chưa cho nhân viên cơ sở vật chất xem danh sách yêu cầu đã duyệt')).toBeVisible();
    await page.getByRole('tab', { name: 'Báo hỏng và bảo trì' }).click();
    await expect(page.getByText('Chức năng báo hỏng và bảo trì chưa có API ở máy chủ')).toBeVisible();
  });

  test('mã QR phòng và lịch phòng mở được hộp thoại, báo chưa có API', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.facility.email, '/rooms');
    const row = page.locator('.ant-table-tbody tr.ant-table-row').first();
    await row.getByRole('button', { name: 'QR' }).click();
    await expect(page.getByText('Chức năng mã QR chưa có API ở máy chủ')).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await row.getByRole('button', { name: 'Lịch' }).click();
    await expect(page.getByText('Chức năng lịch phòng chưa có API ở máy chủ')).toBeVisible();
  });
});
