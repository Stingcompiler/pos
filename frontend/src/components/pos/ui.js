/** أصناف Tailwind مشتركة بين مكوّنات نقطة البيع حتى تبقى الحقول متطابقة الشكل. */

export const inputClass = 'w-full px-3 py-2 rounded-xl bg-surface-900/50 border border-white/10 text-white '
  + 'text-sm focus:border-primary-500 transition-colors h-10 placeholder-surface-500';

export const labelClass = 'block text-xs font-medium text-surface-300 mb-1';

/** شارة درجة الجودة: الموظف يجب أن يميّز الأصلي من التجاري والمستعمل قبل البيع. */
export const QUALITY_BADGE = {
  original: 'bg-success-500/15 text-success-400',
  commercial: 'bg-primary-600/20 text-primary-300',
  used: 'bg-warning-500/15 text-warning-400',
};

export const CUSTOMER_TYPE_BADGE = {
  retail: 'bg-surface-700/60 text-surface-300',
  workshop: 'bg-primary-600/20 text-primary-300',
  wholesale: 'bg-warning-500/15 text-warning-400',
};
