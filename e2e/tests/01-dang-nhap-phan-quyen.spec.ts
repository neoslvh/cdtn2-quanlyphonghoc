import { expect, test } from '@playwright/test';
import { ACCOUNTS, PASSWORD, loginAs } from './support';

// FR-01, FR-02, NFR-04: đăng nhập, đăng xuất và phân quyền theo vai trò ở giao diện.
test.describe('E2E-01 đăng nhập và đăng xuất', () => {
  test('sai mật khẩu hiện thông báo chung, không lộ email có tồn tại hay không', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS.requester.email);
    await page.getByLabel('Mật khẩu').fill('SaiMatKhau1');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByText('Email hoặc mật khẩu không đúng.')).toBeVisible();
    await page.getByLabel('Email').fill('khong-ton-tai@qlphong.local');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByText('Email hoặc mật khẩu không đúng.')).toBeVisible();
  });

  test('đăng nhập đúng vào trang chủ có tên và vai trò, đăng xuất quay về trang đăng nhập', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS.requester.email);
    await page.getByLabel('Mật khẩu').fill(PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
    await expect(page.locator('.app-user')).toContainText(ACCOUNTS.requester.role);
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('chưa đăng nhập vào trang bên trong thì bị đưa về trang đăng nhập', async ({ page }) => {
    await page.goto('/rooms/search');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('E2E-02 phân quyền theo vai trò (PB-02)', () => {
  const cases = [
    { who: ACCOUNTS.requester, menu: ['Trang chủ', 'Tra cứu phòng', 'Tạo yêu cầu'], blocked: ['/rooms', '/class-schedule', '/admin/users'], allowed: ['/requests/new', '/rooms/search'] },
    { who: ACCOUNTS.approver, menu: ['Trang chủ', 'Tra cứu phòng', 'Lịch học chính khóa'], blocked: ['/rooms', '/requests/new', '/admin/users'], allowed: ['/class-schedule', '/rooms/search'] },
    { who: ACCOUNTS.facility, menu: ['Trang chủ', 'Tra cứu phòng', 'Quản lý phòng'], blocked: ['/class-schedule', '/requests/new', '/admin/users'], allowed: ['/rooms', '/rooms/search'] },
    { who: ACCOUNTS.admin, menu: ['Trang chủ', 'Tra cứu phòng', 'Quản lý phòng', 'Lịch học chính khóa', 'Tài khoản'], blocked: ['/requests/new'], allowed: ['/rooms', '/class-schedule', '/admin/users'] },
  ];

  for (const c of cases) {
    test(`${c.who.role}: menu đúng, trang cấm bị chuyển về trang chủ, trang được phép vào được`, async ({ page, request }) => {
      await loginAs(page, request, c.who.email);
      await expect(page.locator('.app-top nav a')).toHaveText(c.menu);
      for (const path of c.blocked) {
        await page.goto(path);
        await expect(page, `${path} phải bị chặn`).toHaveURL(/\/$/);
      }
      for (const path of c.allowed) {
        await page.goto(path);
        await expect(page, `${path} phải vào được`).toHaveURL(new RegExp(`${path}$`));
      }
    });
  }

  test('quyền được kiểm tra cả ở máy chủ: người đăng ký gọi API thêm phòng bị 403 dù biết đường dẫn', async ({ request }) => {
    const login = await request.post('/api/auth/login', { data: { email: ACCOUNTS.requester.email, password: PASSWORD } });
    const { token } = await login.json();
    const res = await request.post('/api/rooms', { headers: { Authorization: `Bearer ${token}` }, data: { code: 'X.01', name: 'x', campus: 'Cơ sở 1', roomType: 'LAB', capacity: 5, status: 'AVAILABLE' } });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });
});
