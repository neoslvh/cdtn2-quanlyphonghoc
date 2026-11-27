import { describe, expect, test } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect: chỉ quay về đường dẫn nội bộ sau khi đăng nhập', () => {
  test.each([
    ['/requests?status=PENDING', '/requests?status=PENDING'],
    ['/rooms', '/rooms'],
    ['/', '/'],
  ])('giữ nguyên đường dẫn nội bộ %s', (from, to) => expect(safeRedirect(from)).toBe(to));

  test.each([
    ['//evil.com'],
    ['/\\evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['rooms'],
    [''],
    [undefined],
    [null],
    [42],
    [{ pathname: '/rooms' }],
  ])('giá trị không an toàn %p về Trang chủ', (from) => expect(safeRedirect(from)).toBe('/'));
});
