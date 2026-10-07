import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, Loader2, Plus } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatDateTime } from '../cash/format';
import { EmptyState, ErrorState, InlineAlert, LoadingState, PageHeader } from '../cash/PageStates';
import CountStatusBadge from './CountStatusBadge';

const PAGE_SIZE = 20;

/** نموذج جرد جديد: عنوان يصف ما سيُعدّ (رف، فئة، المستودع كاملاً) وملاحظات. */
function NewCountDialog({ onCreated, onClose }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('stock-counts/', { title: title.trim(), notes: notes.trim() });
      onCreated(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر إنشاء الجرد.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-count-title"
        className="w-full max-w-md bg-surface-900 border border-white/10 rounded-2xl p-6 shadow-xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h3 id="new-count-title" className="text-lg font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary-400" aria-hidden="true" />
            جرد جديد
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="text-surface-400 hover:text-white text-lg font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="new-count-title-input" className="block text-xs font-semibold text-surface-300 mb-1">العنوان</label>
            <input
              id="new-count-title-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              autoFocus
              className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
              placeholder="مثلاً: جرد رفوف الفلاتر — أكتوبر"
            />
          </div>
          <div>
            <label htmlFor="new-count-notes" className="block text-xs font-semibold text-surface-300 mb-1">ملاحظات</label>
            <textarea
              id="new-count-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500"
              placeholder="اختياري: من يعدّ، أي الرفوف…"
            />
          </div>
          {error && <InlineAlert>{error}</InlineAlert>}
          <div className="flex gap-3 pt-2 border-t border-white/5 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-semibold transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl gradient-primary text-white text-sm font-semibold transition flex items-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              إنشاء وبدء العدّ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** قائمة عمليات الجرد مع زر «جرد جديد». */
export default function StockCountList({ onOpen }) {
  const [counts, setCounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchCounts = useCallback((pageNumber) => api.get('stock-counts/', {
    params: { page: pageNumber, page_size: PAGE_SIZE },
  })
    .then(({ data }) => {
      const results = data.results || data;
      setCounts(results);
      setTotal(data.count ?? results.length);
      setStatus('ready');
    })
    .catch((err) => {
      setError(apiErrorMessage(err, 'تعذّر تحميل عمليات الجرد.'));
      setStatus('error');
    }), []);

  useEffect(() => {
    fetchCounts(page);
  }, [page, fetchCounts]);

  const goToPage = (next) => {
    setStatus('loading');
    setPage(next);
  };

  const retry = () => {
    setStatus('loading');
    fetchCounts(page);
  };

  const closeCreate = useCallback(() => setCreating(false), []);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={ClipboardList}
        title="الجرد"
        subtitle="عدّ المخزون الفعلي بالمسح أو البحث، ثم تطبيق الفروق على الأرصدة دفعة واحدة"
        gradient="from-warning-500 to-primary-500"
      >
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-xl gradient-primary text-white text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-primary-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          جرد جديد
        </button>
      </PageHeader>

      <section className="glass-card overflow-hidden" aria-label="عمليات الجرد">
        {status === 'loading' ? (
          <LoadingState label="جارٍ تحميل عمليات الجرد…" />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={retry} />
        ) : counts.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="لا توجد عمليات جرد بعد"
            hint="ابدأ جرداً جديداً لرف أو فئة أو للمستودع كله؛ الأرصدة لا تتغير حتى تطبّقه."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-surface-400 text-xs">
                    <th scope="col" className="p-3 font-semibold">الجرد</th>
                    <th scope="col" className="p-3 font-semibold">الحالة</th>
                    <th scope="col" className="p-3 font-semibold text-center">الأصناف</th>
                    <th scope="col" className="p-3 font-semibold">أنشأه</th>
                    <th scope="col" className="p-3 font-semibold">تاريخ الإنشاء</th>
                    <th scope="col" className="p-3 font-semibold">تاريخ التطبيق</th>
                    <th scope="col" className="p-3"><span className="sr-only">فتح</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-surface-200">
                  {counts.map((count) => (
                    <tr key={count.id} className="hover:bg-white/[0.02]">
                      <td className="p-3">
                        <span className="block font-semibold text-white">{count.title || `جرد #${count.id}`}</span>
                        <span className="block text-[11px] text-surface-500 font-mono">#{count.id}</span>
                      </td>
                      <td className="p-3"><CountStatusBadge status={count.status} label={count.status_display} /></td>
                      <td className="p-3 text-center tabular-nums">{count.lines?.length ?? 0}</td>
                      <td className="p-3 text-xs text-surface-300">{count.created_by_name}</td>
                      <td className="p-3 text-xs text-surface-400 whitespace-nowrap">{formatDateTime(count.created_at)}</td>
                      <td className="p-3 text-xs text-surface-400 whitespace-nowrap">
                        {count.applied_at ? formatDateTime(count.applied_at) : '—'}
                      </td>
                      <td className="p-3 text-left">
                        <button
                          type="button"
                          onClick={() => onOpen(count.id)}
                          className="px-3 py-1.5 rounded-lg bg-primary-600/15 hover:bg-primary-600/25 text-primary-300 text-xs font-semibold whitespace-nowrap cursor-pointer"
                        >
                          {count.status === 'draft' ? 'متابعة العدّ' : 'عرض'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <nav className="p-3 border-t border-white/5 flex items-center justify-between text-xs" aria-label="صفحات الجرد">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 flex items-center gap-1 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  السابق
                </button>
                <span className="text-surface-400">صفحة {page} من {totalPages}</span>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 flex items-center gap-1 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  التالي
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      {creating && <NewCountDialog onCreated={(count) => onOpen(count.id)} onClose={closeCreate} />}
    </div>
  );
}
