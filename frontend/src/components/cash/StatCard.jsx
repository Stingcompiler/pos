/** بطاقة رقم واحد: قيمة بارزة وعنوان وسطر مساعد اختياري. */
const TONES = {
  primary: 'bg-primary-500/10 border-primary-500/20 text-primary-400',
  success: 'bg-success-500/10 border-success-500/20 text-success-400',
  warning: 'bg-warning-500/10 border-warning-500/20 text-warning-400',
  danger: 'bg-danger-500/10 border-danger-500/20 text-danger-400',
  neutral: 'bg-surface-700/40 border-white/10 text-surface-300',
};

export default function StatCard({ icon: Icon, label, value, hint, tone = 'primary' }) {
  return (
    <div className="glass-card p-4 flex items-center justify-between gap-3 min-w-0">
      <div className="min-w-0">
        <p className="text-lg font-bold text-white truncate tabular-nums" dir="auto">{value}</p>
        <p className="text-xs text-surface-400">{label}</p>
        {hint && <p className="text-[11px] text-surface-500 mt-0.5 truncate">{hint}</p>}
      </div>
      {Icon && (
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${TONES[tone] || TONES.primary}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
