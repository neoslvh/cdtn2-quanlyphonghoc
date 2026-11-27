import { expect, test } from '@playwright/test';
import { ACCOUNTS, PASSWORD, apiToken, createRequest, loginAs, pickRange, runTag, stamp, workdaysAhead } from './support';

// Các test case trong TestCase_QuanLyPhongHoc_ThietBi.xlsx chưa có kiểm thử tự động ở các spec khác.
// Tên mỗi test bắt đầu bằng mã test case để đối chiếu với file Excel.
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
// Ngày rất xa và ngẫu nhiên để các lần chạy không đụng lịch của nhau.
const farDay = () => 150 + Math.floor(Math.random() * 1200);

test.describe('E2E-14 kiểm thử theo test case', () => {
  test('TC-API-01 GET /api/hello trả lời chào và số phòng khớp danh sách phòng trong PostgreSQL', async ({ request }) => {
    const hello = await (await request.get('/api/hello')).json();
    expect(hello.message).toBe('Xin chào từ API quản lý phòng học');
    const rooms = await (await request.get('/api/rooms', { headers: bearer(await apiToken(request, ACCOUNTS.facility.email)) })).json();
    expect(hello.roomCount).toBe(rooms.total);
  });

  test('TC-UI-02 mất kết nối máy chủ thì trang đăng nhập báo lỗi kết nối, không vào được hệ thống', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.abort('connectionrefused'));
    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS.requester.email);
    await page.getByLabel('Mật khẩu').fill(PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByText('Không kết nối được máy chủ. Vui lòng thử lại sau.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('TC-FR02-03 đổi vai trò có hiệu lực ngay ở lần tải trang kế tiếp', async ({ page, request }) => {
    const admin = bearer(await apiToken(request, ACCOUNTS.admin.email));
    const orgs = (await (await request.get('/api/organizations?scope=all', { headers: admin })).json()).items;
    const email = `doivaitro.${runTag()}${Math.floor(Math.random() * 1000)}@qlphong.local`;
    const created = await (await request.post('/api/users', { headers: admin, data: { fullName: 'Người đổi vai trò', email, organizationId: orgs.find((o: { name: string }) => o.name === 'Phòng Đào tạo').id, role: 'REQUESTER' } })).json();
    const first = (await (await request.post('/api/auth/login', { data: { email, password: created.temporaryPassword } })).json()).token;
    await request.post('/api/auth/change-password', { headers: bearer(first), data: { currentPassword: created.temporaryPassword, newPassword: PASSWORD } });

    await loginAs(page, request, email, '/');
    await expect(page.locator('.app-top nav')).toContainText('Tạo yêu cầu');
    expect((await request.patch(`/api/users/${created.user.id}`, { headers: admin, data: { role: 'APPROVER' } })).status()).toBe(200);
    await page.reload();
    await expect(page.locator('.app-top nav')).toContainText('Duyệt yêu cầu');
    await expect(page.locator('.app-top nav')).not.toContainText('Tạo yêu cầu');
  });

  test('TC-FR12-01 hoạt động trong giờ hành chính có bước Phòng Đào tạo, dưới 200 người không có Ban Giám hiệu', async ({ request }) => {
    const r = await createRequest(request, { purpose: `Giờ hành chính ${runTag()}`, daysAhead: 90, hour: 10, room: 'B.05.04' });
    expect(r.steps.map((s) => s.organizationName)).toEqual(['Phòng Đào tạo', 'Phòng Quản trị cơ sở vật chất']);
  });

  // BR-04 chưa được backend cài đặt: chuỗi duyệt đang cố định trong mã (SCRUM-17). Bật lại khi có quy tắc duyệt.
  test.fixme('TC-FR12-02 hoạt động sau 18:00 chuyển Trung tâm Hỗ trợ Sinh viên', async ({ request }) => {
    const r = await createRequest(request, { purpose: `Buổi tối ${runTag()}`, daysAhead: 91, hour: 19, room: 'B.05.04' });
    expect(r.steps.map((s) => s.organizationName)).toContain('Trung tâm Hỗ trợ Sinh viên');
  });

  test('TC-FR12-03 hoạt động từ 200 người có bước Ban Giám hiệu trước bước cuối', async ({ request }) => {
    const headers = bearer(await apiToken(request, ACCOUNTS.requester.email));
    const r = await createRequest(request, { purpose: `Hội nghị ${runTag()}`, daysAhead: farDay(), hour: 8, room: 'C.03.01', participantCount: 220, submit: false });
    const up = await request.post(`/api/requests/${r.id}/attachments`, { headers, multipart: { file: { name: 'van-ban-bgh.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 van ban') } } });
    expect(up.status()).toBe(201);
    const sent = await (await request.post(`/api/requests/${r.id}/submit`, { headers })).json();
    expect(sent.request.steps.map((s: { organizationName: string }) => s.organizationName)).toEqual(['Phòng Đào tạo', 'Ban Giám hiệu', 'Phòng Quản trị cơ sở vật chất']);
  });

  test('TC-FR21-02 và TC-NFR07-01 sửa, hủy và đồng ý một bước đều có dòng nhật ký kèm người thực hiện', async ({ page, request }) => {
    const headers = bearer(await apiToken(request, ACCOUNTS.requester.email));
    const draft = await createRequest(request, { purpose: `Nhật ký sửa ${runTag()}`, daysAhead: 92, hour: 9, room: 'B.05.04', submit: false });
    const full = (await (await request.get(`/api/requests/${draft.id}`, { headers })).json()).request;
    const body = { organizationId: full.organizationId, roomId: full.room.id, purpose: `${full.purpose} đã sửa`, startAt: full.startAt, endAt: full.endAt, participantCount: 25 };
    expect((await request.patch(`/api/requests/${draft.id}`, { headers, data: body })).status()).toBe(200);
    expect((await request.post(`/api/requests/${draft.id}/cancel`, { headers, data: { reason: 'Thử nhật ký' } })).status()).toBe(200);
    const sent = await createRequest(request, { purpose: `Nhật ký duyệt ${runTag()}`, daysAhead: 93, hour: 9, room: 'B.05.04' });
    expect((await request.post(`/api/requests/${sent.id}/approve`, { headers: bearer(await apiToken(request, ACCOUNTS.approver.email)), data: {} })).status()).toBe(200);

    await loginAs(page, request, ACCOUNTS.admin.email, '/admin/audit');
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const search = async (id: string) => {
      await page.getByPlaceholder('Mã đối tượng (UUID)').fill(id);
      await page.getByPlaceholder('Mã đối tượng (UUID)').press('Enter');
    };
    await search(draft.id);
    await expect(rows.filter({ hasText: 'Sửa yêu cầu' })).toContainText('Người đăng ký mẫu');
    await expect(rows.filter({ hasText: 'Hủy yêu cầu' })).toContainText('Người đăng ký mẫu');
    await search(sent.id);
    await expect(rows.filter({ hasText: 'Đồng ý một bước duyệt' })).toContainText('Cán bộ Phòng Đào tạo');
  });

  test('TC-NFR03-01 trang tra cứu phòng trống tải và trả kết quả không quá 3 giây', async ({ page, request }) => {
    const token = await apiToken(request, ACCOUNTS.requester.email);
    await page.addInitScript((t) => localStorage.setItem('qlphong.token', t), token);
    let t0 = Date.now();
    await page.goto('/rooms/search');
    await expect(page.getByRole('button', { name: 'Tìm phòng' })).toBeVisible();
    const load = Date.now() - t0;
    const d = workdaysAhead(30);
    await pickRange(page, stamp(d, 8), stamp(d, 10));
    await page.getByPlaceholder('80').fill('40');
    t0 = Date.now();
    await page.getByRole('button', { name: 'Tìm phòng' }).click();
    await expect(page.locator('.ant-table-tbody tr.ant-table-row').first()).toBeVisible();
    const search = Date.now() - t0;
    test.info().annotations.push({ type: 'thời gian', description: `tải trang ${load} ms, tra cứu ${search} ms` });
    expect(load).toBeLessThan(3000);
    expect(search).toBeLessThan(3000);
  });
  test('TC-NFR06-02 ở chiều rộng 375px các trang chính không tràn ngang, thao tác chính vẫn thấy được', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const pages: [string, string][] = [
      [ACCOUNTS.requester.email, '/'], [ACCOUNTS.requester.email, '/rooms/search'], [ACCOUNTS.requester.email, '/requests/new'], [ACCOUNTS.requester.email, '/requests'], [ACCOUNTS.requester.email, '/notifications'],
      [ACCOUNTS.approver.email, '/approvals'], [ACCOUNTS.approver.email, '/class-schedule'],
      [ACCOUNTS.facility.email, '/rooms'], [ACCOUNTS.facility.email, '/equipment'], [ACCOUNTS.facility.email, '/facility'],
      [ACCOUNTS.admin.email, '/admin/users'], [ACCOUNTS.admin.email, '/admin/audit'], [ACCOUNTS.admin.email, '/admin/reports'],
    ];
    for (const [email, path] of pages) {
      await loginAs(page, request, email, path);
      await expect(page.locator('.app-band h1')).toBeVisible();
      await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} tràn ngang ${overflow}px`).toBeLessThanOrEqual(0);
      await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeInViewport();
    }
  });
});