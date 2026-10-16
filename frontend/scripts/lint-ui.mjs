#!/usr/bin/env node
/**
 * فحص نصي لأنماط الواجهة الممنوعة (docs/ui-profile.md، الجزء أ من وثيقة المراجعة).
 *
 *   npm run lint:ui             # يفشل عند أي مخالفة جديدة، ولا يطبع شيئاً عند الخلوّ
 *   npm run lint:ui -- --list   # كل المخالفات الحالية بمواضعها (للمراجعة)
 *   npm run lint:ui -- --update # يعيد كتابة خط الأساس (بعد ترحيل شاشة)
 *
 * خط الأساس (scripts/ui-lint-baseline.json) يسجّل ما هو قائم قبل اعتماد القواعد: لا يُسمح
 * بزيادته، وينخفض مع كل دفعة ترحيل حتى يصل إلى الصفر. الاستثناء الموثّق يكون بتعليق في
 * السطر نفسه: «ui-allow: السبب».
 *
 * هذا الفحص يكشف تطبيقات معروفة للأنماط فقط ويمكن الالتفاف عليه؛ لا يحكم على الأناقة
 * ولا يغني عن المراجعة البصرية (npm run shots).
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, 'scripts', 'ui-lint-baseline.json');

// القاعدة → [وصفها، التعبير النمطي]
const RULES = {
  strip: ['شريط ملوّن على حافة الكرت (border-s/e/l/r/t-2/4/8)', /\bborder-(?:l|r|s|e|t)-(?:2|4|8)\b|\bborder-\[[2-6]px\]/],
  'icon-box': ['أيقونة داخل مربع أو دائرة مصبوغة', /\bw-(?:9|10|11|12) h-(?:9|10|11|12)\b[^"'`\n]*\brounded-(?:xl|2xl|full)\b[^"'`\n]*\bbg-[a-z]+-\d{2,3}\/(?:10|15|20)\b|\bw-(?:9|10|11|12) h-(?:9|10|11|12)\b[^"'`\n]*\brounded-(?:xl|2xl|full)\b[^"'`\n]*\bbg-gradient-to-/],
  gradient: ['تدرّج لوني على عنصر (bg-gradient-to-*)', /\bbg-gradient-to-/],
  motion: ['حركة مستمرة على عنصر ساكن (animate-pulse/bounce/ping)', /\banimate-(?:pulse|bounce|ping)\b/],
  'hover-scale': ['تكبير عند التحويم يحرّك التخطيط (hover:scale-*)', /\bhover:scale-/],
  'nested-tile': ['بلاطة داخل كرت (bg-surface-900/50 + حد)', /\brounded-(?:xl|lg) bg-surface-900\/50 border border-white\/5\b/],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(jsx|css)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

const hits = {}; // rule → file → [{line, text}]
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  readFileSync(file, 'utf8').split('\n').forEach((text, index) => {
    if (text.includes('ui-allow:')) return;
    for (const [rule, [, pattern]] of Object.entries(RULES)) {
      if (pattern.test(text)) ((hits[rule] ||= {})[rel] ||= []).push({ line: index + 1, text: text.trim().slice(0, 110) });
    }
  });
}

const counts = Object.fromEntries(Object.entries(hits).map(([rule, files]) => [
  rule, Object.fromEntries(Object.entries(files).map(([file, list]) => [file, list.length])),
]));
const args = new Set(process.argv.slice(2));

if (args.has('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  const total = Object.values(counts).reduce((sum, files) => sum + Object.values(files).reduce((a, b) => a + b, 0), 0);
  console.log(`خط الأساس: ${total} مخالفة مسجّلة في ${BASELINE}`);
  process.exit(0);
}

if (args.has('--list')) {
  for (const [rule, [label]] of Object.entries(RULES)) {
    const files = hits[rule] || {};
    const total = Object.values(files).reduce((sum, list) => sum + list.length, 0);
    console.log(`\n${rule} — ${label}: ${total}`);
    for (const [file, list] of Object.entries(files)) for (const hit of list) console.log(`  ${file}:${hit.line}  ${hit.text}`);
  }
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const failures = [];
for (const [rule, files] of Object.entries(hits)) {
  for (const [file, list] of Object.entries(files)) {
    const allowed = baseline[rule]?.[file] || 0;
    if (list.length > allowed) {
      // الجديد غير معروف بالسطر؛ نعرض سطور الملف لهذه القاعدة (آخرها أرجح أن يكون الجديد).
      for (const hit of list.slice(allowed)) failures.push(`${file}:${hit.line}  [${rule}] ${RULES[rule][0]}\n    ${hit.text}`);
    }
  }
}
if (failures.length) {
  console.error(`${failures.length} مخالفة جديدة للأنماط الممنوعة (انظر docs/ui-profile.md):\n`);
  console.error(failures.join('\n'));
  console.error('\nأعد بناء العنصر بدل إخفاء النمط، أو وثّق استثناءً وظيفياً بتعليق «ui-allow: السبب» في السطر نفسه.');
  process.exit(1);
}
