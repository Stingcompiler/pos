import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * حاجز أخطاء عام: يمنع ظهور شاشة بيضاء فارغة عند أي خطأ في العرض،
 * ويعرض رسالة عربية واضحة مع زر إعادة المحاولة.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // تسجيل الخطأ للمطوّر في وحدة التحكم (يمكن ربطه لاحقاً بخدمة تتبّع).
    console.error('حدث خطأ غير متوقع في الواجهة:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center bg-surface-950 px-4 font-sans"
      >
        <div className="glass-card p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-danger-500/10 border border-danger-500/20 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-danger-400" />
          </div>

          <h1 className="text-lg font-bold text-white">حدث خطأ غير متوقع</h1>

          <p className="text-xs text-surface-400 leading-relaxed">
            نعتذر عن هذا الخلل. يمكنك إعادة تحميل الصفحة للمتابعة، وإذا تكرّر
            الخطأ تواصل مع مسؤول النظام.
          </p>

          {this.state.error?.message && (
            <p
              dir="ltr"
              className="text-[10px] text-surface-550 font-mono bg-surface-950/60 border border-white/5 rounded-xl p-3 text-left break-all"
            >
              {this.state.error.message}
            </p>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            className="w-full h-11 rounded-xl gradient-primary text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            إعادة تحميل الصفحة
          </button>
        </div>
      </div>
    );
  }
}
