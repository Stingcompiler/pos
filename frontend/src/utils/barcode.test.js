import { describe, it, expect } from 'vitest';
import { barcodeBars, encodeValues, isEncodable, CODE128_PATTERNS } from './barcode';

describe('ترميز Code 128', () => {
  it('كل رمز عرضه 11 وحدة', () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    for (const pattern of CODE128_PATTERNS) {
      expect([...pattern].reduce((sum, digit) => sum + Number(digit), 0)).toBe(11);
    }
  });

  it('يحسب رمز التحقق الموزون', () => {
    // Start B = 104، ثم P=48 J=42 J=42 1=17 2=18 3=19 C=35 بأوزان 1..7:
    // 104 + 48 + 84 + 126 + 68 + 90 + 114 + 245 = 879 → 879 mod 103 = 55
    expect(encodeValues('PJJ123C').at(-1)).toBe(55);
  });

  it('يستخدم Code C للأرقام الزوجية الطول', () => {
    expect(encodeValues('1234')).toEqual([105, 12, 34, (105 + 12 + 34 * 2) % 103]);
  });

  it('يرفض النص العربي ويعيد عرضاً ثابتاً للأشرطة', () => {
    expect(isEncodable('فلتر')).toBe(false);
    const { width } = barcodeBars('OF-100');
    // 10 هامش + (بداية + 6 رموز + تحقق) × 11 + نهاية 13 + 10 هامش
    expect(width).toBe(10 + 8 * 11 + 13 + 10);
  });
});
