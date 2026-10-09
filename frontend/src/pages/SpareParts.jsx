import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { mediaUrl } from '../api/media';
import { useAuth } from '../context/useAuth';
import { apiErrorMessage, downloadFile, fetchAllPages, localDateString } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import PartFormModal from '../components/parts/PartFormModal';
import MovementsModal from '../components/parts/MovementsModal';
import ImportModal from '../components/parts/ImportModal';
import LabelsDialog from '../components/parts/LabelsDialog';
import LabelsPrint from '../components/parts/LabelsPrint';
import {
  PAGE_SIZE, QUALITY_BADGE_CLASSES, QUALITY_GRADES, carModelLabel, isPriceStale, priceAgeDays,
} from '../components/parts/partForm';
import { CHECKBOX_CLASS } from '../components/parts/styles';
import {
  Package, Plus, Search, Edit3, Trash2, X, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
  Image as ImageIcon, History, FileSpreadsheet, Download, Upload, Printer, RefreshCw, Clock,
} from 'lucide-react';

const TOOLBAR_BTN =
  'flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-800 border border-white/5 text-surface-200 text-sm ' +
  'hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer';

const FILTER_CLASS =
  'w-full px-4 py-3 rounded-xl bg-surface-900/50 border border-white/10 text-white focus:border-primary-500 ' +
  'transition-colors text-sm h-[46px]';

const NOTICE_CLASSES = {
  success: 'bg-success-500/10 border-success-500/20 text-success-400',
  warning: 'bg-warning-500/10 border-warning-500/20 text-warning-400',
  error: 'bg-danger-500/10 border-danger-500/20 text-danger-400',
};

const ICON_BTN = 'p-2 rounded-lg text-surface-400 transition-all cursor-pointer';

export default function SpareParts() {
  const { user } = useAuth();
  const canEdit = user?.role === 'manager' || user?.role === 'supervisor';
  const canDelete = user?.role === 'manager';
  // سعر الشراء لا يصل من الخادم للموظف أصلاً؛ نخفي العمود بدل عرض أصفار مضلّلة.
  const canSeeCost = canEdit;

  // ── القائمة ──
  const [parts, setParts] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadedAt, setLoadedAt] = useState(0);
  const [page, setPage] = useState(1);
  // رقم آخر طلب: ردّ بحث قديم يصل متأخراً لا يكتب فوق نتائج البحث الحالي.
  const requestId = useRef(0);

  // ── البحث والتصفية (على الخادم) ──
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [carModelFilter, setCarModelFilter] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // ── القوائم المرجعية ──
  const [categories, setCategories] = useState([]);
  const [carModels, setCarModels] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [refsError, setRefsError] = useState('');

  // ── النوافذ ──
  const [formPartId, setFormPartId] = useState(undefined); // undefined = مغلق، null = إضافة
  const [movementsPart, setMovementsPart] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [printJob, setPrintJob] = useState(null);

  // القطع المحددة للملصقات: خريطة id → القطعة، تبقى عند التنقل بين الصفحات.
  const [selected, setSelected] = useState({});
  const [notice, setNotice] = useState(null);
  const [downloading, setDownloading] = useState('');

  const loadReferences = useCallback(async () => {
    setRefsError('');
    // الفئات والموردون لنموذج الإضافة/التعديل فقط (للمدير والمشرف).
    const [cars, cats, sups] = await Promise.allSettled([
      fetchAllPages('car-models/'),
      canEdit ? fetchAllPages('categories/') : Promise.resolve([]),
      canEdit ? fetchAllPages('suppliers/') : Promise.resolve([]),
    ]);
    if (cars.status === 'fulfilled') setCarModels(cars.value);
    if (cats.status === 'fulfilled') setCategories(cats.value);
    if (sups.status === 'fulfilled') setSuppliers(sups.value);
    if ([cars, cats, sups].some((result) => result.status === 'rejected')) {
      setRefsError('تعذّر تحميل بعض القوائم (الموديلات، الفئات، الموردين)؛ قد تظهر قوائم الاختيار ناقصة.');
    }
  }, [canEdit]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  // تأخير البحث 300 مللي ثانية: طلب واحد بعد توقف الكتابة لا طلب لكل حرف.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      if (next !== search) {
        setSearch(next);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const filterParams = useMemo(() => {
    const params = {};
    if (search) params.search = search;
    if (carModelFilter) params.compatible_cars = carModelFilter;
    if (qualityFilter) params.quality_grade = qualityFilter;
    if (lowStockOnly) params.low_stock = 1;
    return params;
  }, [search, carModelFilter, qualityFilter, lowStockOnly]);

  const loadParts = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('spare-parts/', {
        params: { ...filterParams, page, page_size: PAGE_SIZE },
      });
      if (current !== requestId.current) return;
      const rows = Array.isArray(data) ? data : data.results || [];
      setParts(rows);
      setCount(Array.isArray(data) ? rows.length : (data.count ?? rows.length));
      setLoadedAt(Date.now());
      // الملصقات تُطبع بأحدث سعر ورف للقطع المحددة الظاهرة في الصفحة.
      setSelected((prev) => {
        const fresh = rows.filter((row) => prev[row.id]);
        if (fresh.length === 0) return prev;
        const next = { ...prev };
        fresh.forEach((row) => { next[row.id] = row; });
        return next;
      });
    } catch (err) {
      if (current !== requestId.current) return;
      // صفحة لم تعد موجودة (بعد حذف أو استيراد): نعود للأولى بدل عرض خطأ.
      if (err.response?.status === 404 && page > 1) {
        setPage(1);
        return;
      }
      // فشل التحميل ليس «لا توجد قطع»: نعرض الخطأ مع إعادة المحاولة.
      setLoadError(apiErrorMessage(err, 'تعذّر تحميل قطع الغيار.'));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [filterParams, page]);

  useEffect(() => {
    loadParts();
  }, [loadParts]);

  useEffect(() => {
    if (notice?.type !== 'success') return undefined;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // ── الإجراءات ──
  const handleSaved = ({ part, created, warning }) => {
    setFormPartId(undefined);
    setNotice(warning
      ? { type: 'warning', text: warning }
      : { type: 'success', text: created ? `تمت إضافة «${part.name}».` : `تم تحديث «${part.name}».` });
    loadParts();
  };

  const handleDelete = async (part) => {
    if (!window.confirm(`هل أنت متأكد من حذف «${part.name}»؟`)) return;
    try {
      await api.delete(`spare-parts/${part.id}/`);
      setSelected((prev) => {
        if (!prev[part.id]) return prev;
        const next = { ...prev };
        delete next[part.id];
        return next;
      });
      setNotice({ type: 'success', text: `تم حذف «${part.name}».` });
      if (parts.length === 1 && page > 1) setPage((p) => p - 1);
      else loadParts();
    } catch (err) {
      setNotice({ type: 'error', text: apiErrorMessage(err, 'فشل حذف القطعة.') });
    }
  };

  const handleDownload = async (kind) => {
    setDownloading(kind);
    try {
      if (kind === 'export') {
        // التصدير يتبع البحث والتصفية الحالية.
        await downloadFile('spare-parts/export/', `spare-parts-${localDateString()}.xlsx`, filterParams);
      } else {
        await downloadFile('spare-parts/import-template/', 'parts-template.xlsx');
      }
    } catch (err) {
      setNotice({
        type: 'error',
        text: apiErrorMessage(err, kind === 'export' ? 'تعذّر تصدير الملف.' : 'تعذّر تحميل القالب.'),
      });
    } finally {
      setDownloading('');
    }
  };

  const selectedList = Object.values(selected);
  const pageAllSelected = parts.length > 0 && parts.every((part) => selected[part.id]);
  const pageSomeSelected = parts.some((part) => selected[part.id]);

  const toggleSelect = (part) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[part.id]) delete next[part.id];
      else next[part.id] = part;
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = { ...prev };
      if (pageAllSelected) parts.forEach((part) => { delete next[part.id]; });
      else parts.forEach((part) => { next[part.id] = part; });
      return next;
    });
  };

  const handlePrint = ({ copies, showPrice }) => {
    setShowLabels(false);
    setPrintJob({ id: Date.now(), parts: selectedList, copies, showPrice });
  };

  // ثابتة المرجع: PrintArea يعيد الطباعة إن تغيّرت onDone.
  const handlePrintDone = useCallback(() => setPrintJob(null), []);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const filtersActive = Boolean(search || carModelFilter || qualityFilter || lowStockOnly);
  const columnCount = canSeeCost ? 12 : 11;

  return (
    <div className="animate-fade-in select-none">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-primary-500 flex items-center justify-center shadow-md shadow-primary-600/10">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">قطع الغيار</h1>
            <p className="text-sm text-surface-400">إدارة المخزون والقطع المتوفرة</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button type="button" onClick={() => setShowImport(true)} className={TOOLBAR_BTN}>
              <Upload className="w-4 h-4" />
              استيراد Excel
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDownload('export')}
            disabled={Boolean(downloading)}
            className={TOOLBAR_BTN}
            title="تصدير القطع حسب البحث والتصفية الحالية"
          >
            {downloading === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            تصدير Excel
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => handleDownload('template')}
              disabled={Boolean(downloading)}
              className={TOOLBAR_BTN}
            >
              {downloading === 'template' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              تحميل القالب
            </button>
          )}
          {canEdit && (
            <button
              id="spare-parts-add-btn"
              type="button"
              onClick={() => setFormPartId(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-white font-medium
                text-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200
                shadow-lg shadow-primary-600/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              إضافة قطعة
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`mb-4 p-3 rounded-xl border text-sm flex items-start justify-between gap-3 animate-fade-in ${NOTICE_CLASSES[notice.type]}`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="إغلاق التنبيه"
            className="p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {refsError && (
        <div className="mb-4 p-3 rounded-xl border border-warning-500/20 bg-warning-500/10 text-warning-400 text-xs flex items-center justify-between gap-3">
          <span>{refsError}</span>
          <button
            type="button"
            onClick={loadReferences}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning-500/15 hover:bg-warning-500/25 font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Search & Filter */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
        <div className="md:col-span-2 relative">
          <label htmlFor="spare-parts-search" className="sr-only">بحث في قطع الغيار</label>
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
          <input
            id="spare-parts-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pr-12 pl-4 py-3 rounded-xl bg-surface-900/50 border border-white/10 text-white
              placeholder-surface-500 focus:border-primary-500 transition-colors text-sm"
            placeholder="ابحث بالاسم أو الاسم الدارج أو رقم القطعة أو الرقم الأصلي أو السيارة..."
          />
        </div>
        <div>
          <label htmlFor="spare-parts-car-model-filter" className="sr-only">تصفية بالسيارة المتوافقة</label>
          <select
            id="spare-parts-car-model-filter"
            value={carModelFilter}
            onChange={(e) => { setCarModelFilter(e.target.value); setPage(1); }}
            className={FILTER_CLASS}
          >
            <option value="">-- تصفية بالسيارة المتوافقة --</option>
            {carModels.map((car) => (
              <option key={car.id} value={car.id}>{carModelLabel(car)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="spare-parts-quality-filter" className="sr-only">تصفية بدرجة الجودة</label>
          <select
            id="spare-parts-quality-filter"
            value={qualityFilter}
            onChange={(e) => { setQualityFilter(e.target.value); setPage(1); }}
            className={FILTER_CLASS}
          >
            <option value="">-- كل درجات الجودة --</option>
            {QUALITY_GRADES.map((grade) => (
              <option key={grade.value} value={grade.value}>{grade.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <input
            id="spare-parts-low-stock"
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => { setLowStockOnly(e.target.checked); setPage(1); }}
            className={CHECKBOX_CLASS}
          />
          <label htmlFor="spare-parts-low-stock" className="text-xs font-semibold text-surface-300 cursor-pointer flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warning-400" />
            النواقص فقط (عند حد التنبيه أو أقل)
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedList.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected({})}
              className="px-3 py-2 rounded-xl text-xs text-surface-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              إلغاء التحديد ({selectedList.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowLabels(true)}
            disabled={selectedList.length === 0 || Boolean(printJob)}
            className={TOOLBAR_BTN}
            title={selectedList.length === 0 ? 'حدد القطع من الجدول أولاً' : undefined}
          >
            <Printer className="w-4 h-4" />
            طباعة ملصقات{selectedList.length > 0 && ` (${selectedList.length})`}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-busy={loading}>
            <thead>
              <tr className="border-b border-white/5">
                <th scope="col" className="px-3 py-4 w-10">
                  <input
                    type="checkbox"
                    aria-label="تحديد كل قطع هذه الصفحة للملصقات"
                    checked={pageAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = pageSomeSelected && !pageAllSelected;
                    }}
                    onChange={togglePage}
                    disabled={parts.length === 0}
                    className={CHECKBOX_CLASS}
                  />
                </th>
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium w-16">الصورة</th>
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium">القطعة</th>
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium">رقم القطعة</th>
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium">الفئة</th>
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium">المورد</th>
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium max-w-[220px]">السيارات المتوافقة</th>
                {canSeeCost && (
                  <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium">سعر الشراء</th>
                )}
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium">سعر البيع</th>
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium">المخزون</th>
                <th scope="col" className="px-5 py-4 text-right text-surface-400 font-medium">الرف</th>
                <th scope="col" className="px-5 py-4 text-center text-surface-400 font-medium w-32">إجراءات</th>
              </tr>
            </thead>
            <tbody className={loading && parts.length > 0 && !loadError ? 'opacity-60 transition-opacity' : ''}>
              {loadError ? (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center">
                    <div role="alert" className="flex flex-col items-center gap-3">
                      <AlertTriangle className="w-8 h-8 text-danger-400" />
                      <p className="text-danger-400 text-sm font-semibold">{loadError}</p>
                      <button
                        type="button"
                        onClick={loadParts}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-800 text-surface-200 text-sm hover:bg-surface-700 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        إعادة المحاولة
                      </button>
                    </div>
                  </td>
                </tr>
              ) : loading && parts.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center">
                    <Loader2 className="w-6 h-6 text-primary-500 animate-spin mx-auto" aria-label="جارٍ التحميل" />
                  </td>
                </tr>
              ) : parts.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center text-surface-500">
                    {filtersActive ? 'لا توجد قطع مطابقة للبحث أو التصفية.' : 'لا توجد قطع غيار مسجّلة بعد.'}
                  </td>
                </tr>
              ) : (
                parts.map((part) => {
                  const stale = isPriceStale(part, loadedAt);
                  const isSelected = Boolean(selected[part.id]);
                  return (
                    <tr
                      key={part.id}
                      className={`border-b border-white/3 hover:bg-white/2 transition-colors ${isSelected ? 'bg-primary-600/5' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`تحديد ${part.name} للملصقات`}
                          checked={isSelected}
                          onChange={() => toggleSelect(part)}
                          className={CHECKBOX_CLASS}
                        />
                      </td>
                      <td className="px-5 py-2.5">
                        {part.image ? (
                          <img src={mediaUrl(part.image)} alt={part.name} className="w-10 h-10 rounded-lg object-cover border border-white/5" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-surface-650" />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-white font-bold">
                        <div className="flex items-center gap-2">
                          <span>{part.name}</span>
                          {part.is_featured && (
                            <span className="px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-400 text-[10px] font-semibold border border-accent-500/30">
                              مميز
                            </span>
                          )}
                        </div>
                        {(part.brand || part.quality_grade) && (
                          <div className="flex items-center gap-1.5 mt-1 font-normal">
                            {part.brand && <span className="text-[11px] text-surface-400">{part.brand}</span>}
                            {part.quality_grade && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${QUALITY_BADGE_CLASSES[part.quality_grade] || 'border-white/10 text-surface-300'}`}>
                                {part.quality_grade_display || part.quality_grade}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-surface-300 font-mono text-right" dir="ltr">{part.part_number}</div>
                        {part.oem_number && (
                          <div className="text-[11px] text-surface-500 mt-0.5">
                            الأصلي: <span className="font-mono" dir="ltr">{part.oem_number}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-1 rounded-lg bg-primary-600/15 text-primary-300 text-xs font-semibold">
                          {part.category_name || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {part.supplier_name ? (
                          <span className="px-2 py-1 rounded-lg bg-accent-600/15 text-accent-300 text-xs font-semibold">
                            {part.supplier_name}
                          </span>
                        ) : (
                          <span className="text-surface-500 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {part.compatible_cars_display && part.compatible_cars_display.length > 0 ? (
                            part.compatible_cars_display.map((car, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 rounded bg-surface-800 text-surface-300 text-[10px] whitespace-nowrap border border-white/3 font-medium">
                                {car}
                              </span>
                            ))
                          ) : (
                            <span className="text-surface-500 text-xs">-</span>
                          )}
                        </div>
                      </td>
                      {canSeeCost && (
                        <td className="px-5 py-3.5 text-surface-300 font-mono">{formatCurrency(part.purchase_price)}</td>
                      )}
                      <td className="px-5 py-3.5">
                        <span className="text-accent-400 font-extrabold font-mono">{formatCurrency(part.selling_price)}</span>
                        {stale && (
                          <span
                            className="mt-1 flex w-fit items-center gap-1 px-1.5 py-0.5 rounded bg-warning-500/15 text-warning-400 text-[10px] font-semibold border border-warning-500/30 whitespace-nowrap"
                            title={`مسعّرة بـ ${part.cost_currency} ولم يُراجَع سعرها بسعر الصرف منذ ${priceAgeDays(part.price_updated_at, loadedAt)} يوماً`}
                          >
                            <Clock className="w-3 h-3" />
                            سعر قديم ({priceAgeDays(part.price_updated_at, loadedAt)} يوماً)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`flex items-center gap-1 font-bold ${part.is_low_stock ? 'text-warning-400' : 'text-surface-300'}`}
                          title={part.is_low_stock ? `عند حد التنبيه (${part.min_stock_alert}) أو أقل` : undefined}
                        >
                          {part.is_low_stock && <AlertTriangle className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />}
                          {part.stock_quantity}
                          {part.is_low_stock && <span className="sr-only">(منخفض)</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-surface-400 font-medium">{part.shelf_location || '-'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setMovementsPart(part)}
                            aria-label={`سجل حركات ${part.name}`}
                            title="سجل الحركات"
                            className={`${ICON_BTN} hover:text-accent-400 hover:bg-accent-500/10`}
                          >
                            <History className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setFormPartId(part.id)}
                              aria-label={`تعديل ${part.name}`}
                              title="تعديل"
                              className={`${ICON_BTN} hover:text-primary-400 hover:bg-primary-600/10`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(part)}
                              aria-label={`حذف ${part.name}`}
                              title="حذف"
                              className={`${ICON_BTN} hover:text-danger-400 hover:bg-danger-500/10`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loadError && count > 0 && (
          <div className="flex items-center justify-center gap-3 p-4 border-t border-white/5 select-none">
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                aria-label="الصفحة السابقة"
                className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <span className="text-xs text-surface-400 font-semibold font-mono flex items-center gap-2">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              {totalPages > 1 && `صفحة ${page} من ${totalPages} — `}
              {count} قطعة
            </span>
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                aria-label="الصفحة التالية"
                className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ──── Modals ──── */}
      {formPartId !== undefined && (
        <PartFormModal
          key={formPartId ?? 'new'}
          partId={formPartId}
          categories={categories}
          carModels={carModels}
          suppliers={suppliers}
          canPrice={canEdit}
          onClose={() => setFormPartId(undefined)}
          onSaved={handleSaved}
          onStockChanged={loadParts}
        />
      )}

      {movementsPart && (
        <MovementsModal part={movementsPart} onClose={() => setMovementsPart(null)} />
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={loadParts} />
      )}

      {showLabels && (
        <LabelsDialog parts={selectedList} onClose={() => setShowLabels(false)} onPrint={handlePrint} />
      )}

      {printJob && (
        <LabelsPrint
          key={printJob.id}
          parts={printJob.parts}
          copies={printJob.copies}
          showPrice={printJob.showPrice}
          onDone={handlePrintDone}
        />
      )}
    </div>
  );
}
