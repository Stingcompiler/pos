import { describe, expect, it } from 'vitest';
import {
  countSummary, lineDifference, normalizeScanCode, parseCountInput, sortByShelf, upsertLine,
} from './stockMath';

const line = (overrides) => ({
  id: 1,
  spare_part: 1,
  spare_part_name: 'فلتر زيت',
  shelf_location: 'A1',
  counted_quantity: 5,
  current_quantity: 5,
  system_quantity: null,
  ...overrides,
});

describe('lineDifference', () => {
  it('قبل التطبيق يقارن بالرصيد الحالي', () => {
    expect(lineDifference(line({ counted_quantity: 7, current_quantity: 5 }))).toBe(2);
    expect(lineDifference(line({ counted_quantity: 3, current_quantity: 5 }))).toBe(-2);
  });

  it('بعد التطبيق يقارن برصيد لحظة التطبيق', () => {
    const applied = line({ counted_quantity: 4, current_quantity: 4, system_quantity: 6 });
    expect(lineDifference(applied, { applied: true })).toBe(-2);
    expect(lineDifference(line({ system_quantity: null }), { applied: true })).toBeNull();
  });
});

describe('countSummary', () => {
  it('يجمع القطع ووحدات الزيادة والنقص', () => {
    const summary = countSummary([
      line({ id: 1, counted_quantity: 10, current_quantity: 7 }),
      line({ id: 2, counted_quantity: 2, current_quantity: 5 }),
      line({ id: 3, counted_quantity: 1, current_quantity: 4 }),
      line({ id: 4, counted_quantity: 6, current_quantity: 6 }),
    ]);
    expect(summary).toEqual({
      parts: 4,
      countedUnits: 19,
      increaseParts: 1,
      increaseUnits: 3,
      decreaseParts: 2,
      decreaseUnits: 6,
      unchangedParts: 1,
    });
  });

  it('جرد فارغ', () => {
    expect(countSummary([]).parts).toBe(0);
  });
});

describe('sortByShelf', () => {
  it('ترتيب طبيعي للرفوف ثم الاسم، والقطع بلا رف في الآخر', () => {
    const lines = [
      line({ id: 1, shelf_location: 'A10', spare_part_name: 'ب' }),
      line({ id: 2, shelf_location: '', spare_part_name: 'أ' }),
      line({ id: 3, shelf_location: 'A2', spare_part_name: 'ج' }),
      line({ id: 4, shelf_location: 'A2', spare_part_name: 'ا' }),
      line({ id: 5, shelf_location: null, spare_part_name: 'د' }),
    ];
    expect(sortByShelf(lines).map((item) => item.id)).toEqual([4, 3, 1, 2, 5]);
    // لا يغيّر الأصل.
    expect(lines[0].id).toBe(1);
  });
});

describe('parseCountInput / normalizeScanCode', () => {
  it('أعداد صحيحة غير سالبة فقط، مع الأرقام العربية', () => {
    expect(parseCountInput('12')).toBe(12);
    expect(parseCountInput('٠')).toBe(0);
    expect(parseCountInput(' ١٥ ')).toBe(15);
    expect(parseCountInput('-1')).toBeNull();
    expect(parseCountInput('1.5')).toBeNull();
    expect(parseCountInput('')).toBeNull();
  });

  it('ينظّف الرمز الممسوح', () => {
    expect(normalizeScanCode('  OF-١٠٠ ')).toBe('OF-100');
  });
});

describe('upsertLine', () => {
  it('يستبدل السطر بنفس المعرّف أو يضيفه', () => {
    const lines = [line({ id: 1, counted_quantity: 1 })];
    expect(upsertLine(lines, line({ id: 1, counted_quantity: 2 }))).toEqual([line({ id: 1, counted_quantity: 2 })]);
    expect(upsertLine(lines, line({ id: 2 }))).toHaveLength(2);
    expect(lines[0].counted_quantity).toBe(1);
  });
});
