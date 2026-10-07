import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Ban, Boxes, Camera, ChevronRight, ClipboardCheck, ClipboardList, Loader2,
  Package, RefreshCw, ScanBarcode,
} from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatDateTime } from '../cash/format';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../cash/PageStates';
import StatCard from '../cash/StatCard';
import ApplyCountDialog from './ApplyCountDialog';
import CameraScanner from './CameraScanner';
import CountLinesTable from './CountLinesTable';
import CountStatusBadge from './CountStatusBadge';
import PartPicker from './PartPicker';
import { isCameraScanSupported, playScanFeedback } from './scanTools';
import { countSummary, normalizeScanCode, sortByShelf, upsertLine } from './stockMath';

const FLASH_MS = 650;
const HIGHLIGHT_MS = 1400;

/**
 * شاشة جرد واحد. في المسودة: مسح بقارئ الباركود أو الكاميرا (+1 لكل مسحة)،
 * أو بحث وكتابة العدد، ثم التطبيق. بعد التطبيق أو الإلغاء: للقراءة فقط.
 */
export default function StockCountSheet({ countId, onBack }) {
  const [count, setCount] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState('');

  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [flash, setFlash] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [pendingScans, setPendingScans] = useState(0);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [cameraSupported] = useState(() => isCameraScanSupported());
  const [cameraOpen, setCameraOpen] = useState(false);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const scanInputRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const flashTimer = useRef(null);
  const highlightTimer = useRef(null);

  const fetchCount = useCallback(({ quiet = false } = {}) => api.get(`stock-counts/${countId}/`)
    .then(({ data }) => {
      setCount(data);
      setStatus('ready');
    })
    .catch((err) => {
      const message = apiErrorMessage(err, 'تعذّر تحميل الجرد.');
      if (quiet) {
        setActionError(message);
      } else {
        setError(message);
        setStatus('error');
      }
    }), [countId]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  useEffect(() => () => {
    window.clearTimeout(flashTimer.current);
    window.clearTimeout(highlightTimer.current);
  }, []);

  /** وميض أخضر/أحمر مع نغمة، وإبراز السطر الذي تغيّر. */
  const signal = useCallback((ok, message, lineId = null) => {
    playScanFeedback(ok);
    setFeedback({ ok, message });
    setFlash(ok ? 'ok' : 'error');
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
    if (lineId) {
      setHighlightId(lineId);
      window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    }
  }, []);

  const applyLine = useCallback((line) => {
    setCount((prev) => (prev ? { ...prev, lines: upsertLine(prev.lines, line) } : prev));
  }, []);

  const markBusy = useCallback((id, on) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  /*
   * طابور تسلسلي لكل ما يغيّر الأسطر: قارئ USB يرسل المسحات أسرع من ردّ
   * الخادم، وطلبان متزامنان لنفس القطعة قد يُضيّع أحدهما زيادة (+1).
   */
  const enqueue = useCallback((task) => {
    const run = queueRef.current.then(task);
    queueRef.current = run.catch(() => {});
    return run;
  }, []);

  const scan = useCallback((raw) => {
    const value = normalizeScanCode(raw);
    if (!value) return;
    setPendingScans((n) => n + 1);
    enqueue(async () => {
      try {
        const { data } = await api.post(`stock-counts/${countId}/lines/`, {
          code: value, counted_quantity: 1, mode: 'add',
        });
        applyLine(data);
        signal(true, `${data.spare_part_name} — المعدود الآن ${data.counted_quantity}`, data.id);
      } catch (err) {
        signal(false, err.response?.status === 404
          ? `لم يُعثر على قطعة بالرمز «${value}».`
          : apiErrorMessage(err, 'تعذّر تسجيل المسح.'));
      }
      setPendingScans((n) => n - 1);
    });
  }, [countId, enqueue, applyLine, signal]);

  const setQuantity = useCallback((partId, quantity, lineId = null) => {
    if (lineId) markBusy(lineId, true);
    return enqueue(async () => {
      let saved = false;
      try {
        const { data } = await api.post(`stock-counts/${countId}/lines/`, {
          spare_part: partId, counted_quantity: quantity, mode: 'set',
        });
        applyLine(data);
        signal(true, `${data.spare_part_name} — العدد ${data.counted_quantity}`, data.id);
        saved = true;
      } catch (err) {
        signal(false, apiErrorMessage(err, 'تعذّر حفظ العدد.'));
      }
      if (lineId) markBusy(lineId, false);
      return saved;
    });
  }, [countId, enqueue, applyLine, signal, markBusy]);

  const removeLine = (line) => {
    const ok = window.confirm(`حذف «${line.spare_part_name}» (المعدود ${line.counted_quantity}) من الجرد؟`);
    if (!ok) return;
    markBusy(line.id, true);
    setActionError('');
    enqueue(async () => {
      try {
        await api.delete(`stock-counts/${countId}/lines/${line.id}/`);
        setCount((prev) => (prev ? { ...prev, lines: prev.lines.filter((item) => item.id !== line.id) } : prev));
      } catch (err) {
        setActionError(apiErrorMessage(err, 'تعذّر حذف السطر.'));
      }
      markBusy(line.id, false);
    });
  };

  const handleScanSubmit = (event) => {
    event.preventDefault();
    scan(code);
    setCode('');
    scanInputRef.current?.focus();
  };

  const closeCamera = useCallback(() => setCameraOpen(false), []);
  const closeApply = useCallback(() => setApplyOpen(false), []);

  const refresh = async () => {
    setRefreshing(true);
    setActionError('');
    await fetchCount({ quiet: true });
    setRefreshing(false);
  };

  const retry = () => {
    setStatus('loading');
    fetchCount();
  };

  const openApply = () => {
    setApplyError('');
    setApplyOpen(true);
  };

  const confirmApply = async () => {
    setApplyBusy(true);
    setApplyError('');
    try {
      // ننتظر أي مسح ما زال في الطابور حتى يدخل في التطبيق.
      await queueRef.current;
      const { data } = await api.post(`stock-counts/${countId}/apply/`);
      setCount(data);
      setApplyOpen(false);
      setCameraOpen(false);
      setFeedback(null);
    } catch (err) {
      setApplyError(apiErrorMessage(err, 'تعذّر تطبيق الجرد.'));
    }
    setApplyBusy(false);
  };

  const cancelCount = async () => {
    const ok = window.confirm('إلغاء هذا الجرد؟ لن تتغير أي أرصدة، ولا يمكن متابعة العدّ فيه بعد الإلغاء.');
    if (!ok) return;
    setCancelBusy(true);
    setActionError('');
    try {
      await queueRef.current;
      const { data } = await api.post(`stock-counts/${countId}/cancel/`);
      setCount(data);
      setCameraOpen(false);
      setFeedback(null);
    } catch (err) {
      setActionError(apiErrorMessage(err, 'تعذّر إلغاء الجرد.'));
    }
    setCancelBusy(false);
  };

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      aria-label="رجوع إلى قائمة الجرد"
      className="w-10 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 border border-white/10 text-surface-200 flex items-center justify-center transition cursor-pointer shrink-0"
    >
      <ChevronRight className="w-5 h-5" aria-hidden="true" />
    </button>
  );

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        {backButton}
        <div className="glass-card"><LoadingState label="جارٍ تحميل الجرد…" /></div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-4">
        {backButton}
        <div className="glass-card"><ErrorState message={error} onRetry={retry} /></div>
      </div>
    );
  }

  const draft = count.status === 'draft';
  const applied = count.status === 'applied';
  const lines = sortByShelf(count.lines);
  const summary = countSummary(count.lines, { applied });
  const countedByPart = new Map(count.lines.map((line) => [line.spare_part, line.counted_quantity]));
  const title = count.title || `جرد #${count.id}`;

  const flashRing = flash === 'ok'
    ? 'ring-2 ring-success-500'
    : flash === 'error' ? 'ring-2 ring-danger-500' : 'ring-0';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {backButton}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white flex flex-wrap items-center gap-2">
              <span className="truncate">{title}</span>
              <CountStatusBadge status={count.status} label={count.status_display} />
            </h1>
            <p className="text-xs text-surface-400">
              أنشأه {count.created_by_name} · {formatDateTime(count.created_at)}
              {applied && ` · طبّقه ${count.applied_by_name || '—'} في ${formatDateTime(count.applied_at)}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-label="تحديث الجرد وأرصدة النظام"
          title="تحديث"
          className="w-10 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 border border-white/10 text-surface-200 flex items-center justify-center transition cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {count.notes && (
        <p className="text-sm text-surface-300 glass-card p-4 whitespace-pre-line">{count.notes}</p>
      )}

      {applied && (
        <InlineAlert tone="success">
          طُبّق الجرد: أصبح رصيد كل قطعة معدودة مساوياً لعددها، وسُجّلت حركة «جرد #{count.id}» للفروق.
          الجدول يقارن العدد برصيد النظام لحظة التطبيق.
        </InlineAlert>
      )}
      {count.status === 'cancelled' && (
        <InlineAlert tone="warning">هذا الجرد ملغي: لم تتغير أي أرصدة.</InlineAlert>
      )}
      {actionError && <InlineAlert onDismiss={() => setActionError('')}>{actionError}</InlineAlert>}

      {draft && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className={`glass-card p-5 space-y-3 transition-shadow ${flashRing}`} aria-labelledby="scan-title">
            <h2 id="scan-title" className="text-sm font-bold text-white flex items-center gap-2">
              <ScanBarcode className="w-4 h-4 text-primary-400" aria-hidden="true" />
              المسح (+1 لكل مسحة)
            </h2>
            <form onSubmit={handleScanSubmit} className="flex gap-2">
              <label htmlFor="scan-code" className="sr-only">الباركود أو رقم القطعة</label>
              <input
                id="scan-code"
                ref={scanInputRef}
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="send"
                dir="ltr"
                placeholder="امسح الباركود أو اكتب الرقم ثم Enter"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm font-mono h-11 focus:border-primary-500 placeholder-surface-500"
              />
              <button
                type="submit"
                disabled={!code.trim()}
                className="px-4 h-11 rounded-xl gradient-primary text-white text-sm font-semibold disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                إضافة
              </button>
            </form>

            <div
              role="status"
              aria-live="polite"
              className={`min-h-[2.5rem] px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${
                feedback ? (feedback.ok ? 'bg-success-500/10 text-success-400' : 'bg-danger-500/10 text-danger-400') : 'bg-surface-900/50 text-surface-500'
              }`}
            >
              {pendingScans > 0 && <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />}
              <span className="flex-1">
                {feedback ? feedback.message : 'جاهز للمسح. قارئ الباركود (USB أو Bluetooth) يعمل كلوحة مفاتيح هنا.'}
              </span>
              {pendingScans > 1 && <span className="text-[11px] text-surface-400">بالانتظار {pendingScans}</span>}
            </div>

            {cameraSupported ? (
              cameraOpen ? (
                <CameraScanner onDetected={scan} onClose={closeCamera} />
              ) : (
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 border border-white/10 text-surface-200 text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  مسح بالكاميرا
                </button>
              )
            ) : (
              <p className="text-[11px] text-surface-500">
                المسح بالكاميرا غير مدعوم في هذا المتصفح (يعمل في Chrome على أندرويد). استخدم قارئ باركود USB أو
                Bluetooth، أو اكتب الرقم ثم Enter.
              </p>
            )}
          </section>

          <section className="glass-card p-5" aria-label="إضافة قطعة بالبحث">
            <PartPicker
              countedByPart={countedByPart}
              onSet={(part, quantity) => setQuantity(part.id, quantity)}
              disabled={applyBusy || cancelBusy}
            />
          </section>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Package} label="أصناف معدودة" value={summary.parts} hint={`${summary.unchangedParts} بلا فرق`} />
        <StatCard icon={Boxes} label="وحدات معدودة" value={summary.countedUnits} tone="neutral" />
        <StatCard
          icon={ArrowUpCircle}
          label="زيادة عن النظام"
          value={`+${summary.increaseUnits}`}
          hint={`في ${summary.increaseParts} صنف`}
          tone="success"
        />
        <StatCard
          icon={ArrowDownCircle}
          label="نقص عن النظام"
          value={`−${summary.decreaseUnits}`}
          hint={`في ${summary.decreaseParts} صنف`}
          tone="danger"
        />
      </div>

      <section className="glass-card overflow-hidden" aria-labelledby="lines-title">
        <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
          <h2 id="lines-title" className="text-sm font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary-400" aria-hidden="true" />
            الأصناف المعدودة (مرتبة حسب الرف)
          </h2>
          {draft && <span className="text-[11px] text-surface-500">عدّل العدد مباشرة في الجدول.</span>}
        </div>
        {lines.length === 0 ? (
          <EmptyState
            icon={ScanBarcode}
            title={draft ? 'لم تُعدّ أي قطعة بعد' : 'لا توجد أصناف في هذا الجرد'}
            hint={draft ? 'امسح باركود أول قطعة على الرف، أو ابحث عنها واكتب عددها.' : undefined}
          />
        ) : (
          <CountLinesTable
            lines={lines}
            editable={draft}
            applied={applied}
            busyIds={busyIds}
            highlightId={highlightId}
            onSetQuantity={(line, quantity) => setQuantity(line.spare_part, quantity, line.id)}
            onRemove={removeLine}
            onInvalid={() => signal(false, 'أدخل عدداً صحيحاً (0 أو أكثر).')}
          />
        )}
      </section>

      {draft && (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
          <button
            type="button"
            onClick={cancelCount}
            disabled={cancelBusy || applyBusy}
            className="px-4 py-2.5 rounded-xl bg-danger-500/10 hover:bg-danger-500/20 border border-danger-500/25 text-danger-400 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {cancelBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Ban className="w-4 h-4" aria-hidden="true" />}
            إلغاء الجرد
          </button>
          <button
            type="button"
            onClick={openApply}
            disabled={lines.length === 0 || pendingScans > 0 || cancelBusy}
            className="px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
            تطبيق الجرد على المخزون
          </button>
        </div>
      )}

      {applyOpen && (
        <ApplyCountDialog
          summary={summary}
          title={count.title}
          busy={applyBusy}
          error={applyError}
          onConfirm={confirmApply}
          onCancel={closeApply}
        />
      )}
    </div>
  );
}
