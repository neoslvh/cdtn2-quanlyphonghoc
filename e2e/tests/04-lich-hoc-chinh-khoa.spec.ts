import { expect, test } from '@playwright/test';
import { ACCOUNTS, dmy, loginAs, pickRange, runTag, stamp, workdaysAhead } from './support';

// FR-23, BR-10, BR-11, BR-12: Phòng Đào tạo nhập thời khóa biểu; lớp học chiếm phòng và chặn yêu cầu của người đăng ký.
const HEADER = 'Học kỳ,Mã môn,Tên môn,Lớp,Thứ,Tiết bắt đầu,Số tiết,Mã phòng,Từ ngày,Đến ngày';

// Một thứ hai cách hôm nay hơn 20 ngày làm việc, để phiếu thử không vướng quy tắc 3 ngày làm việc.
function mondayAhead(): Date {
  const d = workdaysAhead(25);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

test.describe.serial('E2E-06 nhập thời khóa biểu (PB-23)', () => {
  const tag = runTag();
  const semester = `HK-E2E-${tag}`;
  const klass = `K-E2E-${tag}`;
  const monday = mondayAhead();
  const toDate = new Date(monday.getTime() + 14 * 24 * 3600 * 1000);
  // Thứ hai, tiết 7 đến 9 tức 13:00 đến 15:15, trong ba tuần, phòng C.03.02.
  const goodRow = `${semester},E2E${tag},Môn kiểm thử ${tag},${klass},2,7,3,C.03.02,${dmy(monday)},${dmy(toDate)}`;
  const csv = (rows: string[]) => ({ name: 'tkb.csv', mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...rows].join('\n'), 'utf8') });

  test('tải tệp mẫu về có đúng dòng tiêu đề 10 cột', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.approver.email, '/class-schedule');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải tệp mẫu' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('thoi-khoa-bieu-mau.csv');
  });

  test('tệp có dòng sai báo lỗi theo từng dòng và từng cột, không có bản xem trước, cho tải danh sách lỗi', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.approver.email, '/class-schedule');
    await page.locator('input[aria-label="Học kỳ"]').fill(semester);
    const bad = goodRow.replace('C.03.02', 'Z.99.99').replace(',2,7,', ',9,7,');
    await page.locator('input[type=file]').setInputFiles(csv([goodRow, bad]));
    await page.getByRole('button', { name: 'Kiểm tra tệp' }).click();
    await expect(page.getByRole('heading', { name: /Tệp có 2 lỗi/ })).toBeVisible();
    const errors = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(errors.nth(0)).toContainText('3');
    await expect(page.locator('.ant-table-tbody').first()).toContainText('Thứ');
    await expect(page.locator('.ant-table-tbody').first()).toContainText('Không có trong hệ thống.');
    await expect(page.getByRole('button', { name: 'Xác nhận nhập' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tải danh sách lỗi' })).toBeVisible();
  });

  test('tệp đúng cho bản xem trước 3 buổi, xác nhận nhập thì buổi học hiện trong tra cứu', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.approver.email, '/class-schedule');
    await page.locator('input[aria-label="Học kỳ"]').fill(semester);
    await page.locator('input[type=file]').setInputFiles(csv([goodRow]));
    await page.getByRole('button', { name: 'Kiểm tra tệp' }).click();
    const stats = page.locator('.stat-row');
    await expect(stats).toContainText('Dòng hợp lệ');
    await expect(stats.locator('.ant-statistic').nth(0)).toContainText('1');
    await expect(stats.locator('.ant-statistic').nth(1)).toContainText('3');
    await expect(stats.locator('.ant-statistic').nth(2)).toContainText('0');
    await page.getByRole('button', { name: 'Xác nhận nhập' }).click();
    await page.getByRole('button', { name: 'Xác nhận nhập' }).last().click();
    await expect(page.getByText('Đã nhập thời khóa biểu')).toBeVisible();
    await expect(page.getByText(/3 buổi học có hiệu lực/)).toBeVisible();
    // Tra cứu theo phòng C.03.02 thấy lớp vừa nhập.
    await page.locator('.ant-select').filter({ hasText: 'Tất cả phòng' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'C.03.02' }).click();
    await expect(page.locator('.ant-table-tbody').last()).toContainText(klass);
  });

  test('người đăng ký tra cứu đúng giờ có lớp thì phòng C.03.02 không còn trống', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/rooms/search');
    await pickRange(page, stamp(monday, 13), stamp(monday, 15));
    await page.getByPlaceholder('80').fill('30');
    await page.getByRole('button', { name: 'Tìm phòng' }).click();
    await expect(page.getByRole('heading', { name: /Phòng gợi ý/ })).toBeVisible();
    await expect(page.locator('.ant-table-tbody')).not.toContainText('C.03.02');
    await expect(page.locator('.ant-table-tbody')).toContainText('C.03.01');
  });

  test('gửi yêu cầu vào phòng và giờ đang có lớp bị từ chối, thông báo nêu rõ lớp học gây trùng', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/requests/new');
    await pickRange(page, stamp(monday, 14), stamp(monday, 16));
    await page.getByRole('spinbutton').first().fill('30');
    await page.getByPlaceholder(/Sinh hoạt chuyên đề/).fill('Trùng lớp học');
    await page.locator('.ant-select').filter({ hasText: 'Chọn phòng' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'C.03.02' }).click();
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
    await expect(page.getByText('Phòng C.03.02 đã có lớp học trong khung giờ này.')).toBeVisible();
    await expect(page.getByText(new RegExp(`Lớp E2E${tag} \\(${klass}\\) trong thời khóa biểu`))).toBeVisible();
  });

  test('sửa buổi học sang giờ trống thành công, hủy buổi học thì phòng trống lại giờ đó', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.approver.email, '/class-schedule');
    await page.locator('.ant-select').filter({ hasText: 'Tất cả phòng' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'C.03.02' }).click();
    const row = page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: klass }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Hủy buổi' }).click();
    await page.getByRole('button', { name: 'Hủy buổi' }).last().click();
    await expect(page.getByText('Đã hủy buổi học')).toBeVisible();
    await expect(row).toContainText('Đã hủy');
  });

  test('người đăng ký không vào được trang lịch học chính khóa và API trả 403', async ({ page, request }) => {
    await loginAs(page, request, ACCOUNTS.requester.email, '/class-schedule');
    await expect(page).toHaveURL(/\/$/);
    const { token } = await (await request.post('/api/auth/login', { data: { email: ACCOUNTS.requester.email, password: process.env.E2E_PASSWORD || 'Demo@12345' } })).json();
    const res = await request.get('/api/class-schedule', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });
});
