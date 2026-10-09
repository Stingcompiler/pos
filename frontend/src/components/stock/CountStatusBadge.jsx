import { Ban, CheckCircle2, ClipboardList } from 'lucide-react';

const BADGES = {
  draft: { icon: ClipboardList, className: 'bg-warning-500/10 text-warning-400 border-warning-500/20', label: 'قيد العدّ' },
  applied: { icon: CheckCircle2, className: 'bg-success-500/10 text-success-400 border-success-500/20', label: 'مطبّق' },
  cancelled: { icon: Ban, className: 'bg-surface-700/50 text-surface-400 border-white/10', label: 'ملغي' },
};

/** شارة حالة الجرد (النص من الخادم إن وُجد). */
export default function CountStatusBadge({ status, label }) {
  const badge = BADGES[status] || BADGES.draft;
  const Icon = badge.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${badge.className}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {label || badge.label}
    </span>
  );
}
