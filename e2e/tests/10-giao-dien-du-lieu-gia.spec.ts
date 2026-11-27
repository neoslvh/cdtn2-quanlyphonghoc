import { expect, test } from '@playwright/test';
import { ACCOUNTS, loginAs, runTag } from './support';

// Các trang chờ API chạy trên dữ liệu giả (VITE_API_MOCK=true), đăng nhập vẫn qua máy chủ thật.
// Chạy riêng: dựng giao diện bằng "VITE_API_MOCK=true npx vite" rồi đặt E2E_MOCK=1. Bộ chạy thường bỏ qua file này.
test.skip(process.env.E2E_MOCK !== '1', 'Chỉ chạy khi giao diện dùng dữ liệu giả (E2E_MOCK=1)');

const rows = (page: import('@playwright/test').Page) => page.locator('.ant-table-tbody tr.ant-table-row');

test.describe('E2E-13 giao diện trên dữ liệu giả (Plan 3)', () => {
  test('quản lý thiết bị: lọc theo phòng, thêm thiết bị, xem mã QR, đổi tình trạng sang Hỏng', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.facility.email, '/equipment');
    await expect(rows(page).first()).toBeVisible();
    await page.getByRole('combobox', { name: 'Lọc theo phòng' }).fill('A.10.01');
    await page.locator('.ant-select-item-option').filter({ hasText: 'A.10.01' }).click();
    await expect(rows(page)).toHaveCount(5);

    const code = `PJ-E2E-${runTag()}`;
    await page.getByRole('button', { name: 'Thêm thiết bị' }).click();
    await page.getByPlaceholder('PJ-A1001-1').fill(code);
    await page.getByPlaceholder('Máy chiếu Epson X1').fill('Máy chiếu kiểm thử');
    await page.locator('.ant-modal .ant-select').filter({ hasText: 'Chọn loại' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Máy chiếu' }).click();
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByText('Đã thêm thiết bị')).toBeVisible();
    const row = rows(page).filter({ hasText: code });
    await expect(row).toContainText('Tốt');

    await row.getByRole('button', { name: 'Xem QR' }).click();
    await expect(page.locator('.qr-image')).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();

    await row.getByRole('button', { name: 'Sửa' }).click();
    await page.locator('.ant-modal .ant-select').filter({ hasText: 'Tốt' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Hỏng' }).click();
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(row).toContainText('Hỏng');
  });

  test('quy tắc duyệt: có ba quy tắc theo SRS, thêm quy tắc mới, tắt một quy tắc', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/approval-rules');
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).filter({ hasText: 'BGH_TU_200' })).toContainText('từ 200 người');
    await page.getByRole('button', { name: 'Thêm quy tắc' }).click();
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByText('Nhập mã quy tắc')).toBeVisible();
    await page.getByPlaceholder('BGH_TU_200').fill('CUOI_TUAN');
    await page.getByPlaceholder('Từ 200 người cần Ban Giám hiệu phê duyệt').fill('Cuối tuần cần Phòng Đào tạo');
    await page.locator('.ant-modal .ant-select').filter({ hasText: 'Chọn đơn vị' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Phòng Đào tạo' }).click();
    await page.getByPlaceholder('200').fill('50');
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByText('Đã thêm quy tắc')).toBeVisible();
    await expect(rows(page)).toHaveCount(4);
    await page.getByRole('switch', { name: 'Bật quy tắc CUOI_TUAN' }).click();
    await expect(page.getByRole('switch', { name: 'Bật quy tắc CUOI_TUAN' })).not.toBeChecked();
  });

  test('báo cáo thống kê: có thẻ số liệu, chuyển sang bảng số liệu', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/reports');
    await expect(page.locator('.stat-card').filter({ hasText: 'Tổng yêu cầu' })).toBeVisible();
    await expect(page.getByLabel('Yêu cầu theo trạng thái')).toContainText('Đã duyệt');
    await page.getByText('Bảng số liệu', { exact: true }).click();
    await expect(page.locator('.ant-table').first()).toContainText('Số yêu cầu');
  });

  test('bàn giao và báo hỏng mở được hai tab, chưa có dữ liệu thì báo rõ', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.facility.email, '/facility');
    await expect(page.getByText('Chưa có yêu cầu đã duyệt')).toBeVisible();
    await page.getByRole('tab', { name: 'Báo hỏng và bảo trì' }).click();
    await expect(page.getByText('Không có báo hỏng nào')).toBeVisible();
  });
});
