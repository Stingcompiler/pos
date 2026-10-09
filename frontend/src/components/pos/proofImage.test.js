import { describe, it, expect } from 'vitest';
import { MAX_PROOF_SIDE, fitWithin } from './proofImage';

describe('fitWithin', () => {
  it('يترك الصورة ضمن الحد كما هي', () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(MAX_PROOF_SIDE, 100)).toEqual({ width: MAX_PROOF_SIDE, height: 100 });
  });

  it('يصغّر لقطة شاشة هاتف طويلة مع الحفاظ على النسبة', () => {
    // 1170×2532 (لقطة iPhone) أطول من حد الخادم 2048.
    expect(fitWithin(1170, 2532)).toEqual({ width: 946, height: 2048 });
  });
});
