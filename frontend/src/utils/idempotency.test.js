import { describe, it, expect, afterEach, vi } from 'vitest';
import { createIdempotencyKey } from './idempotency';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createIdempotencyKey', () => {
  it('يولّد UUID v4 مختلفاً في كل مرة', () => {
    const first = createIdempotencyKey();
    const second = createIdempotencyKey();
    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });

  it('يعمل دون randomUUID (HTTP على الشبكة المحلية)', () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (array) => realCrypto.getRandomValues(array),
    });

    const key = createIdempotencyKey();
    expect(key).toMatch(UUID_V4);
    expect(createIdempotencyKey()).not.toBe(key);
  });
});
