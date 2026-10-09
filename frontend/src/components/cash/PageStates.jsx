import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';

/**
 * عناصر مشتركة لشاشات الصندوق والتحويلات والجرد: رأس الصفحة وحالات
 * التحميل والفراغ والخطأ. فصل الحالات الثلاث مهم: قائمة فارغة بسبب خطأ شبكة
 * تبدو للمستخدم كأنه «لا توجد بيانات» فيتخذ قراراً خاطئاً.
 */

export function PageHeader({ icon, title, subtitle, gradient = 'from-primary-600 to-primary-400', children }) {
  const Icon = icon;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {subtitle && <p className="text-sm text-surface-400">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function LoadingState({ label = 'جارٍ التحميل…', compact = false }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 text-surface-400 text-sm ${compact ? 'py-8' : 'py-20'}`}
    >
      <Loader2 className="w-7 h-7 text-primary-500 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 text-center ${compact ? 'py-6' : 'py-16'}`}
    >
      <AlertCircle className="w-9 h-9 text-danger-400" aria-hidden="true" />
      <p className="text-sm text-danger-400 font-semibold max-w-md">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-650 text-white text-xs font-semibold transition flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = Inbox, title, hint, compact = false, children }) {
  const Icon = icon;
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center text-surface-500 ${compact ? 'py-8' : 'py-16'}`}>
      <Icon className="w-10 h-10 opacity-40" aria-hidden="true" />
      <p className="text-sm font-semibold text-surface-300">{title}</p>
      {hint && <p className="text-xs max-w-md">{hint}</p>}
      {children}
    </div>
  );
}

/** شريط رسالة صغير داخل البطاقات (خطأ إجراء أو تنبيه). */
export function InlineAlert({ tone = 'danger', children, onDismiss }) {
  const tones = {
    danger: 'bg-danger-500/10 border-danger-500/20 text-danger-400',
    warning: 'bg-warning-500/10 border-warning-500/20 text-warning-400',
    success: 'bg-success-500/10 border-success-500/20 text-success-400',
    info: 'bg-primary-500/10 border-primary-500/20 text-primary-300',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${tones[tone] || tones.danger}`}
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إخفاء الرسالة"
          className="text-current opacity-70 hover:opacity-100 font-bold leading-none cursor-pointer"
        >
          &times;
        </button>
      )}
    </div>
  );
}
