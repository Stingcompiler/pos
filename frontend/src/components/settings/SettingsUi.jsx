import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

/**
 * عناصر واجهة صغيرة مشتركة بين أقسام صفحة الإعدادات، حتى تبدو الأقسام
 * الجديدة كالقديمة (نفس الحقول والتنبيهات) دون تكرار الأصناف في كل ملف.
 */

export const INPUT_CLASS =
  'w-full px-4 py-2.5 rounded-xl bg-surface-950/60 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors h-10 placeholder-surface-600';

export const LABEL_CLASS = 'block text-sm text-surface-300 mb-2 font-medium';

export const HINT_CLASS = 'text-xs text-surface-400 mt-1.5 leading-relaxed';

export const PRIMARY_BUTTON_CLASS =
  'flex items-center justify-center gap-2 h-10 px-5 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed';

export const SECONDARY_BUTTON_CLASS =
  'flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-surface-900 border border-white/10 text-surface-200 text-sm font-semibold hover:text-white hover:border-primary-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

/** تنبيه نجاح أو خطأ؛ role يجعل قارئ الشاشة يعلن الرسالة عند ظهورها. */
export function Notice({ type = 'error', children }) {
  if (!children) return null;
  const isError = type === 'error';
  const Icon = isError ? AlertCircle : CheckCircle;
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-start gap-2 p-4 rounded-xl text-sm animate-fade-in border ${
        isError
          ? 'bg-danger-500/10 border-danger-500/20 text-danger-400'
          : 'bg-success-500/10 border-success-500/20 text-success-400'
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-px" aria-hidden="true" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function LoadingBlock({ label }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center" role="status">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-2" aria-hidden="true" />
      <p className="text-surface-400 text-sm">{label}</p>
    </div>
  );
}

/** بطاقة قسم بعنوان وأيقونة ووصف قصير يشرح الغرض. */
export function SectionCard({ icon: Icon, title, description, actions, children }) {
  return (
    <section className="glass-card p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-primary-400" aria-hidden="true" />}
            {title}
          </h2>
          {description && <p className="text-sm text-surface-400 mt-1 leading-relaxed">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
