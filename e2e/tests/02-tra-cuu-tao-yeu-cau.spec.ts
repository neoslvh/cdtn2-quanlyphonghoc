import { expect, test } from '@playwright/test';
import { ACCOUNTS, loginAs, pickRange, stamp, workdaysAhead } from './support';

// FR-06, FR-07, FR-08: tra cứu phòng trống, lập phiếu, gửi và các lỗi nghiệp vụ hiện đúng trên giao diện.
test.describe('E2E-03 tra cứu phòng trống (PB-06)', () => {
  test('nhập khung giờ và số người, kết quả chỉ có phòng đủ sức chứa và trạng thái Còn trống', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/rooms/search');
    const d = workdaysAhead(30);
    await pickRange(page, stamp(d, 8), stamp(d, 10));
    await page.getByPlaceholder('80').fill('100');
    await page.getByRole('button', { name: 'Tìm phòng' }).click();
    await expect(page.getByRole('heading', { name: /Phòng gợi ý/ })).toBeVisible();
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(rows.first()).toBeVisible();
    // Với 100 người chỉ còn A.10.02 (100 chỗ) và các hội trường, phòng 80 chỗ và 45 chỗ bị loại.
    await expect(page.locator('.ant-table-tbody')).not.toContainText('A.10.01');
    await expect(page.locator('.ant-table-tbody')).not.toContainText('B.05.04');
    await expect(page.locator('.ant-table-tbody')).toContainText('C.03.01');
    await expect(rows.first()).toContainText('Còn trống');
  });

  test('lọc theo loại phòng Hội trường chỉ còn hai hội trường, thiếu số người thì báo lỗi dưới ô nhập', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/rooms/search');
    await page.getByRole('button', { name: 'Tìm phòng' }).click();
    await expect(page.getByText('Chọn khung giờ sử dụng')).toBeVisible();
    await expect(page.getByText('Nhập số người')).toBeVisible();
    const d = workdaysAhead(30);
    await pickRange(page, stamp(d, 8), stamp(d, 10));
    await page.getByPlaceholder('80').fill('50');
    await page.locator('.ant-form-item').filter({ hasText: 'Loại phòng' }).locator('.ant-select').click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Hội trường' }).click();
    await page.getByRole('button', { name: 'Tìm phòng' }).click();
    await expect(page.locator('.ant-table-tbody tr.ant-table-row')).toHaveCount(2);
  });

  test('xóa lọc làm sạch form và kết quả', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/rooms/search');
    const d = workdaysAhead(30);
    await pickRange(page, stamp(d, 8), stamp(d, 10));
    await page.getByPlaceholder('80').fill('30');
    await page.getByRole('button', { name: 'Tìm phòng' }).click();
    await expect(page.locator('.ant-table-tbody tr.ant-table-row').first()).toBeVisible();
    await page.getByRole('button', { name: 'Xóa lọc' }).click();
    await expect(page.getByRole('heading', { name: /Phòng gợi ý/ })).toHaveCount(0);
    await expect(page.getByPlaceholder('80')).toHaveValue('');
  });
});

test.describe('E2E-04 tạo và gửi yêu cầu (PB-07)', () => {
  test('chọn phòng từ kết quả tra cứu, điền mục đích, gửi, nhận mã yêu cầu và tiến độ duyệt', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/rooms/search');
    const d = workdaysAhead(20);
    await pickRange(page, stamp(d, 14), stamp(d, 16));
    await page.getByPlaceholder('80').fill('40');
    await page.getByRole('button', { name: 'Tìm phòng' }).click();
    const row = page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: 'D.02.01' });
    await row.getByRole('button', { name: 'Chọn' }).click();
    await expect(page).toHaveURL(/\/requests\/new$/);
    // Phiếu được điền sẵn phòng, giờ và số người từ kết quả tra cứu.
    await expect(page.locator('.ant-select-content').filter({ hasText: 'D.02.01' })).toBeVisible();
    await expect(page.locator('.ant-picker-range input').first()).toHaveValue(stamp(d, 14));
    await page.getByPlaceholder(/Sinh hoạt chuyên đề/).fill('Sinh hoạt chuyên đề kiểm thử tự động');
    await page.getByRole('button', { name: 'Thêm thiết bị' }).click();
    await page.locator('.ant-select').filter({ hasText: 'Loại thiết bị' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Micro' }).click();
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
    await expect(page.getByText(/Đã gửi yêu cầu REQ-\d+/)).toBeVisible();
    await expect(page.getByText('Đang duyệt')).toBeVisible();
    // Phòng Đào tạo là bước đầu, Phòng Quản trị cơ sở vật chất là bước cuối vì dưới 200 người không cần Ban Giám hiệu.
    await expect(page.locator('.ant-steps')).toContainText('Phòng Đào tạo');
    await expect(page.locator('.ant-steps')).toContainText('Phòng Quản trị cơ sở vật chất');
    await expect(page.locator('.ant-steps')).not.toContainText('Ban Giám hiệu');
  });

  test('gửi sát giờ sử dụng bị từ chối với thông báo ba ngày làm việc, phiếu vẫn ở nháp', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/requests/new');
    const d = workdaysAhead(1);
    await pickRange(page, stamp(d, 8), stamp(d, 10));
    await page.getByRole('spinbutton').first().fill('30');
    await page.getByPlaceholder(/Sinh hoạt chuyên đề/).fill('Gửi sát giờ');
    await page.locator('.ant-select').filter({ hasText: 'Chọn phòng' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'A.10.01' }).click();
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
    await expect(page.getByText('Phải gửi yêu cầu trước giờ sử dụng ít nhất 3 ngày làm việc.')).toBeVisible();
    await expect(page.getByText(/Đã gửi yêu cầu/)).toHaveCount(0);
  });

  test('hoạt động từ 200 người mà chưa đính kèm văn bản Ban Giám hiệu thì bị từ chối', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/requests/new');
    const d = workdaysAhead(25);
    await pickRange(page, stamp(d, 8), stamp(d, 10));
    await page.getByRole('spinbutton').first().fill('220');
    await page.getByPlaceholder(/Sinh hoạt chuyên đề/).fill('Hội thảo lớn');
    await page.locator('.ant-select').filter({ hasText: 'Chọn phòng' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'C.03.01' }).click();
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
    await expect(page.getByText('Hoạt động từ 200 người trở lên cần đính kèm văn bản của Ban Giám hiệu.')).toBeVisible();
  });

  test('số người vượt sức chứa phòng hiện cảnh báo ngay khi nhập và bị máy chủ từ chối khi gửi', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/requests/new');
    const d = workdaysAhead(25);
    await pickRange(page, stamp(d, 8), stamp(d, 10));
    await page.getByPlaceholder(/Sinh hoạt chuyên đề/).fill('Quá sức chứa');
    await page.locator('.ant-select').filter({ hasText: 'Chọn phòng' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'B.05.04' }).click();
    await page.getByRole('spinbutton').first().fill('90');
    await expect(page.getByText(/vượt sức chứa của phòng B\.05\.04/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
    await expect(page.getByText(/Số người tham dự vượt sức chứa của phòng B\.05\.04 \(45 chỗ\)/)).toBeVisible();
  });

  test('chỉ người đăng ký mới có trang tạo yêu cầu', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.approver.email, '/requests/new');
    await expect(page).toHaveURL(/\/$/);
  });
});
