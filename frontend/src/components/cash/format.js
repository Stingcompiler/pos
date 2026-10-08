/**
 * تنسيق التواريخ لشاشات الصندوق والجرد (ميلادي صراحةً، انظر utils/dates).
 */

import { DATE_LOCALE } from '../../utils/dates';

const dayFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

const shortDayFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: 'numeric', month: '2-digit', day: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  hour: '2-digit', minute: '2-digit',
});

/** 'YYYY-MM-DD' → كائن تاريخ محلي (new Date('2026-10-07') يُقرأ UTC فقد يزيح اليوم). */
function parseDay(isoDay) {
  const [year, month, day] = String(isoDay).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

/** اسم اليوم والتاريخ كاملاً: «الأربعاء، ٧ أكتوبر ٢٠٢٦». */
export function formatDay(isoDay) {
  const date = parseDay(isoDay);
  return date ? dayFormatter.format(date) : '—';
}

/** تاريخ مختصر لليوم: «٠٧/١٠/٢٠٢٦». */
export function formatShortDay(isoDay) {
  const date = parseDay(isoDay);
  return date ? shortDayFormatter.format(date) : '—';
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date);
}
