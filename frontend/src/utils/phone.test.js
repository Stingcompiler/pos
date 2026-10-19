import { describe, it, expect } from 'vitest';
import { toWhatsAppNumber, whatsAppLink } from './phone';

describe('toWhatsAppNumber', () => {
  it('الصيغ السودانية المتكافئة تعطي رقماً دولياً واحداً', () => {
    for (const raw of ['0999000222', '+249999000222', '00249999000222', '249999000222', '999000222', '+249 99 900 0222', '٠٩٩٩٠٠٠٢٢٢']) {
      expect(toWhatsAppNumber(raw)).toBe('249999000222');
    }
  });

  it('أرقام الدول الأخرى لا تُعدَّل', () => {
    expect(toWhatsAppNumber('+966501234567')).toBe('966501234567');
    expect(toWhatsAppNumber('00971501234567')).toBe('971501234567');
    expect(toWhatsAppNumber('20 100 123 4567')).toBe('201001234567');
  });

  it('المدخلات غير الصالحة ترجع null', () => {
    for (const raw of ['', '   ', null, undefined, 'abc', '123', '0999', '+2499990002', '+249999000222333', '1'.repeat(16)]) {
      expect(toWhatsAppNumber(raw)).toBeNull();
    }
  });
});

describe('whatsAppLink', () => {
  it('يبني الرابط مع نص مرمَّز أو بدونه ويرجع null للرقم الفاسد', () => {
    expect(whatsAppLink('0999000222')).toBe('https://wa.me/249999000222');
    expect(whatsAppLink('0999000222', 'مرحباً')).toBe(`https://wa.me/249999000222?text=${encodeURIComponent('مرحباً')}`);
    expect(whatsAppLink('xyz')).toBeNull();
  });
});
