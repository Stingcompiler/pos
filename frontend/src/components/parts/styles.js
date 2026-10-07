/** أصناف Tailwind مشتركة بين نوافذ صفحة قطع الغيار (نفس مظهر الصفحة الأصلي). */

export const INPUT_CLASS =
  'w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs ' +
  'focus:border-primary-500 transition-colors h-10 disabled:opacity-60';

export const TEXTAREA_CLASS =
  'w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs ' +
  'focus:border-primary-500 transition-colors resize-none';

export const LABEL_CLASS = 'block text-xs font-semibold text-surface-300 mb-1.5';

export const HINT_CLASS = 'mt-1 text-[11px] text-surface-500 leading-relaxed';

export const CHECKBOX_CLASS =
  'w-4 h-4 rounded border-white/10 text-primary-600 focus:ring-primary-500/30 bg-surface-950 cursor-pointer';

export const BTN_PRIMARY =
  'flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm ' +
  'font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer';

export const BTN_SECONDARY =
  'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-800 text-surface-300 text-sm ' +
  'hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer';

export const ERROR_BOX =
  'p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm animate-fade-in';

export const SUCCESS_BOX =
  'p-3 rounded-xl bg-success-500/10 border border-success-500/20 text-success-400 text-sm animate-fade-in';

export const INFO_BOX =
  'p-3 rounded-xl bg-primary-600/10 border border-primary-500/20 text-primary-200 text-xs leading-relaxed';
