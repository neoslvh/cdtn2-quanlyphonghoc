import { APIRequestContext, expect, test } from '@playwright/test';
import { ACCOUNTS, apiToken, approveAll, cleanupCreated, createApprover, createRequest, loginAs, runTag } from './support';

// E2E-15: mã QR (SCRUM-10), check-in (SCRUM-23), báo hỏng (SCRUM-24) trên hệ thống thật.
// Dùng phòng C.03.02 vì các bộ test khác không đặt phòng này; thiết bị bị báo hỏng không tự trở lại Tốt khi chưa có bảo trì (SCRUM-25).
const ROOM = 'C.03.02';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function roomOf(request: APIRequestContext, code: string) {
  const h = auth(await apiToken(request, ACCOUNTS.requester.email));
  const rooms = (await (await request.get('/api/rooms', { headers: h })).json()).items;
  const id = rooms.find((r: { code: string }) => r.code === code).id;
  return (await (await request.get(`/api/rooms/${id}`, { headers: h })).json()).room;
}
// Mã token in dưới hình QR (dòng chữ thứ hai trong ảnh SVG).
async function roomToken(request: APIRequestContext, roomId: string) {
  const svg = await (await request.get(`/api/rooms/${roomId}/qr`, { headers: auth(await apiToken(request, ACCOUNTS.facility.email)) })).text();
  return { svg, token: /<text[^>]*>[^<]*<\/text><text[^>]*>([^<]+)<\/text>/.exec(svg)![1] };
}
async function approvedRequest(request: APIRequestContext) {
  const facility = await createApprover(request, 'Phòng Quản trị cơ sở vật chất');
  const r = await createRequest(request, { purpose: `QR ${runTag()}`, daysAhead: 150 + Math.floor(Math.random() * 1200), hour: 7 + Math.floor(Math.random() * 12), room: ROOM });
  await approveAll(request, r.id, facility);
  return r;
}

test.describe('E2E-15 mã QR, check-in, báo hỏng', () => {
  test.afterAll(async ({ request }) => cleanupCreated(request));

  test('TC-FR05 nhân viên xem và in được mã QR phòng; quét mã mở đúng trang thông tin phòng', async ({ page, request }) => {
    const room = await roomOf(request, ROOM);
    const { svg, token } = await roomToken(request, room.id);
    expect(svg).toContain(`>${ROOM}</text>`);
    await loginAs(page, request, ACCOUNTS.facility.email, '/rooms');
    await page.getByPlaceholder('Tìm theo mã hoặc tên phòng').fill(ROOM);
    await page.getByPlaceholder('Tìm theo mã hoặc tên phòng').press('Enter');
    const row = page.locator('.ant-table-tbody tr.ant-table-row').filter({ hasText: ROOM });
    await row.getByRole('button', { name: 'QR' }).click();
    await expect(page.locator('img.qr-image')).toBeVisible();
    expect(await page.locator('img.qr-image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100);
    await expect(page.getByRole('button', { name: 'In mã QR' })).toBeEnabled();

    await loginAs(page, request, ACCOUNTS.requester.email, `/qr/${token}`);
    await expect(page.getByRole('heading', { name: `Phòng ${ROOM}` })).toBeVisible();
    await expect(page.getByText('Sức chứa')).toBeVisible();
    await page.goto('/qr/khong-ton-tai');
    await expect(page.getByText('Mã QR không hợp lệ')).toBeVisible();
  });

  test('TC-FR18 check-in sai phòng hoặc sai giờ bị từ chối ngay trên trang chi tiết phiếu', async ({ page, request }) => {
    const r = await approvedRequest(request);
    const room = await roomOf(request, ROOM);
    const other = await roomOf(request, 'D.02.01');
    await loginAs(page, request, ACCOUNTS.requester.email, `/requests/${r.id}`);
    const input = page.getByLabel('Mã QR phòng');
    await input.fill((await roomToken(request, other.id)).token);
    await page.getByRole('button', { name: 'Xác nhận check-in' }).click();
    await expect(page.getByText(`Mã QR không phải của phòng ${ROOM}.`)).toBeVisible();
    // Quét bằng camera ra đường dẫn đầy đủ; máy chủ lấy token ở cuối đường dẫn. Phiếu ở xa trong tương lai nên sai giờ.
    await input.fill(`https://qlphong.test/qr/${(await roomToken(request, room.id)).token}`);
    await page.getByRole('button', { name: 'Xác nhận check-in' }).click();
    await expect(page.getByText(/^Chỉ check-in được từ \d{2}:\d{2} \d{2}\/\d{2}\/\d{4} đến \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}\.$/)).toBeVisible();
    await expect(page.getByText('Chưa check-in')).toBeVisible();
  });

  // Báo hỏng chỉ trong thời gian dùng phòng; phiếu E2E ở xa trong tương lai nên kiểm trường hợp bị chặn và thiết bị giữ Tốt.
  // Ca gửi thành công nằm ở test API và PostgreSQL, vì không dời được giờ phiếu qua API.
  test('TC-FR19 báo hỏng: bắt buộc chọn thiết bị và mô tả; ngoài giờ dùng phòng bị chặn, thiết bị giữ nguyên', async ({ page, request }) => {
    const r = await approvedRequest(request);
    const room = await roomOf(request, ROOM);
    const eq = room.equipmentItems.find((e: { equipmentType: string; status: string }) => e.equipmentType === 'MICROPHONE');
    await loginAs(page, request, ACCOUNTS.requester.email, `/requests/${r.id}`);
    await page.getByRole('button', { name: 'Báo hỏng thiết bị' }).click();
    const modal = page.locator('.ant-modal');
    await modal.getByRole('button', { name: 'Gửi báo hỏng' }).click();
    await expect(modal.getByText('Chọn thiết bị bị hỏng')).toBeVisible();
    await expect(modal.getByText('Mô tả tình trạng hỏng')).toBeVisible();
    await modal.locator('.ant-select').click();
    await page.locator('.ant-select-item-option').filter({ hasText: eq.assetCode }).click();
    await modal.getByPlaceholder(/Máy chiếu không lên hình/).fill(`Micro rè ${runTag()}`);
    await modal.locator('input[type=file]').setInputFiles({ name: 'micro.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]) });
    await modal.getByRole('button', { name: 'Gửi báo hỏng' }).click();
    await expect(modal.getByText(/^Chỉ báo hỏng được trong thời gian sử dụng phòng, từ /)).toBeVisible();
    const after = await roomOf(request, ROOM);
    expect(after.equipmentItems.find((e: { id: string }) => e.id === eq.id).status).toBe(eq.status);
  });
});