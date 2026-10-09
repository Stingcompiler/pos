import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Scale, Search } from 'lucide-react';
import api from '../../api/axios';
import { mediaUrl } from '../../api/media';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import PartsModal from './PartsModal';
import StockAdjustModal from './StockAdjustModal';
import {
  EMPTY_FORM, MARKUP_SOURCE_LABELS, QUALITY_GRADES,
  buildPartFormData, carModelLabel, formFromPart, resolveMarkup, suggestedPrice, validatePartForm,
} from './partForm';
import {
  BTN_PRIMARY, BTN_SECONDARY, CHECKBOX_CLASS, ERROR_BOX, HINT_CLASS, INPUT_CLASS, LABEL_CLASS,
  TEXTAREA_CLASS,
} from './styles';

// قائمة السيارات الطويلة تحتاج حقل تصفية؛ القصيرة تُقرأ بنظرة.
const CAR_FILTER_THRESHOLD = 8;

const READONLY_BOX =
  'flex items-center h-10 px-3 rounded-xl bg-surface-950/40 border border-white/5 text-white text-sm font-mono';

function SectionTitle({ children }) {
  return <h3 className="text-xs font-bold text-primary-300 border-b border-white/5 pb-1.5">{children}</h3>;
}

/**
 * نموذج إضافة/تعديل قطعة غيار (للمدير والمشرف).
 *
 * التعديل يُعبّأ من تفاصيل القطعة (GET spare-parts/{id}/) لا من صف القائمة،
 * حتى لا يُحفظ النموذج بفئة فارغة أو سيارات ناقصة. الرصيد وسعر الشراء لا
 * يُعدَّلان هنا عند التعديل: لهما مسارات موثّقة (التسوية، التوريد).
 */
export default function PartFormModal({
  partId = null,
  categories,
  carModels,
  suppliers,
  canPrice,
  onClose,
  onSaved,
  onStockChanged,
}) {
  const isEdit = partId !== null;
  const [form, setForm] = useState(EMPTY_FORM);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [carFilter, setCarFilter] = useState('');
  const [rates, setRates] = useState(null);
  const [ratesError, setRatesError] = useState(false);
  const [siteDefaults, setSiteDefaults] = useState(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [stockNotice, setStockNotice] = useState('');

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // قارئ الباركود يكتب الرمز ثم Enter، وEnter في حقل التصفية عادة: لا نريد أن يُحفظ النموذج.
  const blockEnter = (e) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  const loadDetail = useCallback(async () => {
    if (partId === null) return;
    setLoadingDetail(true);
    setLoadError('');
    try {
      const { data } = await api.get(`spare-parts/${partId}/`);
      setDetail(data);
      setForm(formFromPart(data));
      setImagePreview(data.image ? mediaUrl(data.image) : null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'تعذّر تحميل بيانات القطعة.'));
    } finally {
      setLoadingDetail(false);
    }
  }, [partId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // أسعار الصرف وهامش المؤسسة لحساب السعر المقترح (للاطلاع فقط؛ الفشل لا يمنع الحفظ).
  useEffect(() => {
    if (!canPrice) return undefined;
    let cancelled = false;
    api.get('exchange-rates/latest/')
      .then(({ data }) => { if (!cancelled) setRates(data); })
      .catch(() => { if (!cancelled) setRatesError(true); });
    api.get('admin/settings/')
      .then(({ data }) => {
        if (!cancelled) {
          setSiteDefaults({
            default_markup_percent: data.default_markup_percent,
            price_rounding: data.price_rounding,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [canPrice]);

  // تحرير رابط المعاينة المحلي عند استبدال الصورة أو إغلاق النموذج.
  useEffect(() => () => {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = validatePartForm(form, { isEdit });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = buildPartFormData(form, { isEdit, image });
      const config = { headers: { 'Content-Type': 'multipart/form-data' } };
      const { data } = isEdit
        ? await api.put(`spare-parts/${partId}/`, body, config)
        : await api.post('spare-parts/', body, config);

      let warning = '';
      if (!isEdit) {
        // نعرض الرصيد كما سجّله الخادم: إن اختلف عن المطلوب لا نوهم بالنجاح.
        const requested = Number(form.opening_quantity || 0);
        if (Number(data.stock_quantity) !== requested) {
          warning = `أُنشئت القطعة «${data.name}» لكن رصيدها المسجّل ${data.stock_quantity} وليس ${requested}. `
            + 'راجع سجل الحركات أو استخدم «تسوية الرصيد».';
        }
      }
      onSaved({ part: data, created: !isEdit, warning });
    } catch (err) {
      setError(apiErrorMessage(err, 'حدث خطأ أثناء الحفظ.'));
      setSaving(false);
    }
  };

  const handleAdjusted = (updated) => {
    setShowAdjust(false);
    // نحدّث الرصيد المعروض فقط؛ بقية النموذج قد تحمل تعديلات لم تُحفظ بعد.
    setDetail((prev) => ({ ...prev, stock_quantity: updated.stock_quantity }));
    setStockNotice(`تم ضبط الرصيد على ${updated.stock_quantity} وسُجّلت حركة «تسوية يدوية».`);
    onStockChanged?.();
  };

  // ── التسعير بسعر الصرف ──
  const currencies = rates?.currencies || [];
  const currencyOptions = form.cost_currency && !currencies.includes(form.cost_currency)
    ? [...currencies, form.cost_currency]
    : currencies;
  const rate = form.cost_currency ? rates?.rates?.[form.cost_currency] : undefined;
  const selectedCategory = categories.find((cat) => String(cat.id) === String(form.category));
  const markup = resolveMarkup({
    partMarkup: form.markup_percent,
    categoryMarkup: selectedCategory?.markup_percent,
    defaultMarkup: siteDefaults?.default_markup_percent,
  });
  const suggestion = form.cost_currency
    ? suggestedPrice({
      foreignCost: form.foreign_cost,
      rate,
      markupPercent: markup ? markup.value : null,
      rounding: markup ? siteDefaults?.price_rounding : null,
    })
    : null;

  const filterText = carFilter.trim().toLowerCase();
  const visibleCars = filterText
    ? carModels.filter((car) => carModelLabel(car).toLowerCase().includes(filterText))
    : carModels;

  const blocked = isEdit && (loadingDetail || Boolean(loadError));

  return (
    <PartsModal
      title={isEdit ? 'تعديل قطعة غيار' : 'إضافة قطعة جديدة'}
      onClose={onClose}
      maxWidth="max-w-2xl"
      busy={saving}
    >
      {isEdit && loadingDetail ? (
        <div className="py-16 text-center text-surface-400 text-sm" role="status">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin mx-auto mb-3" />
          جارٍ تحميل بيانات القطعة...
        </div>
      ) : isEdit && loadError ? (
        <div className="space-y-4">
          <div className={ERROR_BOX} role="alert">{loadError}</div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>إغلاق</button>
            <button type="button" onClick={loadDetail} className={BTN_PRIMARY}>
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── الهوية ── */}
          <section className="space-y-3">
            <SectionTitle>بيانات القطعة</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="part-form-name" className={LABEL_CLASS}>اسم القطعة *</label>
                <input id="part-form-name" type="text" required value={form.name}
                  onChange={(e) => setField('name', e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="part-form-part-number" className={LABEL_CLASS}>رقم القطعة *</label>
                <input id="part-form-part-number" type="text" required value={form.part_number}
                  onChange={(e) => setField('part_number', e.target.value)} className={INPUT_CLASS} dir="ltr" />
              </div>
              <div>
                <label htmlFor="part-form-brand" className={LABEL_CLASS}>العلامة / المصنّع</label>
                <input id="part-form-brand" type="text" value={form.brand} maxLength={100}
                  onChange={(e) => setField('brand', e.target.value)}
                  placeholder="مثال: Toyota، Denso، Bosch" className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="part-form-oem" className={LABEL_CLASS}>الرقم الأصلي (OEM)</label>
                <input id="part-form-oem" type="text" value={form.oem_number} maxLength={100}
                  onChange={(e) => setField('oem_number', e.target.value)} className={INPUT_CLASS} dir="ltr" />
              </div>
              <div>
                <label htmlFor="part-form-quality" className={LABEL_CLASS}>درجة الجودة</label>
                <select id="part-form-quality" value={form.quality_grade}
                  onChange={(e) => setField('quality_grade', e.target.value)} className={INPUT_CLASS}>
                  <option value="">—</option>
                  {QUALITY_GRADES.map((grade) => (
                    <option key={grade.value} value={grade.value}>{grade.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="part-form-barcode" className={LABEL_CLASS}>الباركود</label>
                <input id="part-form-barcode" type="text" value={form.barcode} maxLength={64}
                  onChange={(e) => setField('barcode', e.target.value)} onKeyDown={blockEnter}
                  placeholder="امسحه بالقارئ أو اتركه فارغاً" className={INPUT_CLASS} dir="ltr" />
                <p className={HINT_CLASS}>فارغ = يُطبع رقم القطعة على الملصق.</p>
              </div>
            </div>

            <div>
              <label htmlFor="part-form-aliases" className={LABEL_CLASS}>الأسماء الدارجة</label>
              <textarea id="part-form-aliases" rows="3" value={form.aliases}
                onChange={(e) => setField('aliases', e.target.value)}
                placeholder={'اسم في كل سطر، مثلاً:\nفلتر زيت\nفلتر زيت هايلوكس'}
                aria-describedby="part-form-aliases-hint" className={TEXTAREA_CLASS} />
              <p id="part-form-aliases-hint" className={HINT_CLASS}>
                اسم في كل سطر. البحث في النظام ونقطة البيع يجد القطعة بأي من هذه الأسماء، فاكتب ما يقوله
                الزبائن والفنيون فعلاً.
              </p>
            </div>

            <div>
              <label htmlFor="part-form-description" className={LABEL_CLASS}>الوصف التفصيلي للقطعة</label>
              <textarea id="part-form-description" rows="2" value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="اكتب تفاصيل ومواصفات قطعة الغيار..." className={TEXTAREA_CLASS} />
            </div>
          </section>

          {/* ── التصنيف ── */}
          <section className="space-y-3">
            <SectionTitle>التصنيف والتوافق</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <label htmlFor="part-form-category" className={LABEL_CLASS}>الفئة *</label>
                  <select id="part-form-category" required value={form.category}
                    onChange={(e) => setField('category', e.target.value)} className={INPUT_CLASS}>
                    <option value="">-- اختر فئة --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="part-form-supplier" className={LABEL_CLASS}>المورد (مصدر القطعة)</label>
                  <select id="part-form-supplier" value={form.supplier}
                    onChange={(e) => setField('supplier', e.target.value)} className={INPUT_CLASS}>
                    <option value="">-- بدون مورد --</option>
                    {suppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>{sup.company_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <fieldset>
                <legend className={LABEL_CLASS}>
                  السيارات المتوافقة
                  {form.compatible_cars.length > 0 && (
                    <span className="text-primary-300 font-normal"> (محدد: {form.compatible_cars.length})</span>
                  )}
                </legend>
                {carModels.length > CAR_FILTER_THRESHOLD && (
                  <div className="relative mb-1.5">
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
                    <label htmlFor="part-form-car-filter" className="sr-only">تصفية قائمة السيارات</label>
                    <input id="part-form-car-filter" type="search" value={carFilter}
                      onChange={(e) => setCarFilter(e.target.value)} onKeyDown={blockEnter} placeholder="تصفية: تويوتا، هايلوكس..."
                      className="w-full pr-8 pl-3 py-1.5 rounded-lg bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors" />
                  </div>
                )}
                <div className="w-full px-3 py-2 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs max-h-[150px] overflow-y-auto space-y-1">
                  {carModels.length === 0 ? (
                    <p className="text-surface-500 py-1">لا توجد موديلات مسجّلة.</p>
                  ) : visibleCars.length === 0 ? (
                    <p className="text-surface-500 py-1">لا موديلات مطابقة للتصفية.</p>
                  ) : visibleCars.map((car) => {
                    const isChecked = form.compatible_cars.includes(car.id);
                    return (
                      <label key={car.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setForm((prev) => ({
                            ...prev,
                            compatible_cars: isChecked
                              ? prev.compatible_cars.filter((id) => id !== car.id)
                              : [...prev.compatible_cars, car.id],
                          }))}
                          className={CHECKBOX_CLASS}
                        />
                        <span className="text-xs text-surface-300 truncate">{carModelLabel(car)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </section>

          {/* ── السعر والمخزون ── */}
          <section className="space-y-3">
            <SectionTitle>السعر والمخزون</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isEdit ? (
                <div>
                  <span id="part-form-cost-label" className={LABEL_CLASS}>سعر الشراء (متوسط التكلفة)</span>
                  <output aria-labelledby="part-form-cost-label" className={READONLY_BOX}>
                    {formatCurrency(detail?.purchase_price)}
                  </output>
                  <p className={HINT_CLASS}>يتغيّر عبر التوريد (متوسط التكلفة)</p>
                </div>
              ) : (
                <div>
                  <label htmlFor="part-form-purchase-price" className={LABEL_CLASS}>سعر الشراء *</label>
                  <input id="part-form-purchase-price" type="number" step="0.01" min="0" required
                    value={form.purchase_price} onChange={(e) => setField('purchase_price', e.target.value)}
                    className={INPUT_CLASS} dir="ltr" />
                  <p className={HINT_CLASS}>تكلفة الرصيد الافتتاحي؛ بعدها يُحسب متوسط التكلفة من التوريدات.</p>
                </div>
              )}
              <div>
                <label htmlFor="part-form-selling-price" className={LABEL_CLASS}>سعر البيع *</label>
                <input id="part-form-selling-price" type="number" step="0.01" min="0" required
                  value={form.selling_price} onChange={(e) => setField('selling_price', e.target.value)}
                  className={INPUT_CLASS} dir="ltr" />
              </div>

              {isEdit ? (
                <div>
                  <span id="part-form-stock-label" className={LABEL_CLASS}>الرصيد الحالي</span>
                  <div className="flex items-stretch gap-2">
                    <output aria-labelledby="part-form-stock-label" className={`${READONLY_BOX} flex-1`}>
                      {detail?.stock_quantity ?? '-'}
                    </output>
                    <button type="button" onClick={() => setShowAdjust(true)}
                      className="flex items-center gap-1.5 px-3 rounded-xl bg-primary-600/15 text-primary-300 text-xs font-semibold hover:bg-primary-600/25 transition-colors cursor-pointer whitespace-nowrap">
                      <Scale className="w-4 h-4" />
                      تسوية الرصيد
                    </button>
                  </div>
                  <p className={HINT_CLASS}>الرصيد يتغيّر بالبيع والتوريد والجرد؛ لتصحيحه بعد العدّ استخدم «تسوية الرصيد».</p>
                  {stockNotice && <p className="mt-1 text-[11px] text-success-400" role="status">{stockNotice}</p>}
                </div>
              ) : (
                <div>
                  <label htmlFor="part-form-opening" className={LABEL_CLASS}>الرصيد الافتتاحي</label>
                  <input id="part-form-opening" type="number" min="0" step="1" value={form.opening_quantity}
                    onChange={(e) => setField('opening_quantity', e.target.value)} className={INPUT_CLASS} dir="ltr" />
                  <p className={HINT_CLASS}>الكمية الموجودة الآن؛ تُسجَّل حركة «رصيد افتتاحي» في سجل القطعة.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="part-form-min-stock" className={LABEL_CLASS}>حد التنبيه</label>
                  <input id="part-form-min-stock" type="number" min="0" step="1" value={form.min_stock_alert}
                    onChange={(e) => setField('min_stock_alert', e.target.value)} className={INPUT_CLASS} dir="ltr" />
                </div>
                <div>
                  <label htmlFor="part-form-shelf" className={LABEL_CLASS}>الرف</label>
                  <input id="part-form-shelf" type="text" maxLength={50} value={form.shelf_location}
                    onChange={(e) => setField('shelf_location', e.target.value)} className={INPUT_CLASS} />
                </div>
              </div>
            </div>
          </section>

          {/* ── التسعير بسعر الصرف ── */}
          {canPrice && (
            <section className="space-y-3">
              <SectionTitle>التسعير بسعر الصرف (اختياري)</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="part-form-currency" className={LABEL_CLASS}>عملة الشراء</label>
                  <select id="part-form-currency" value={form.cost_currency}
                    onChange={(e) => setField('cost_currency', e.target.value)} className={INPUT_CLASS}>
                    <option value="">جنيه (بدون سعر صرف)</option>
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="part-form-foreign-cost" className={LABEL_CLASS}>
                    التكلفة بالعملة{form.cost_currency ? ' *' : ''}
                  </label>
                  <input id="part-form-foreign-cost" type="number" step="0.01" min="0"
                    required={Boolean(form.cost_currency)} disabled={!form.cost_currency}
                    value={form.foreign_cost} onChange={(e) => setField('foreign_cost', e.target.value)}
                    className={INPUT_CLASS} dir="ltr" />
                </div>
                <div>
                  <label htmlFor="part-form-markup" className={LABEL_CLASS}>هامش الربح %</label>
                  <input id="part-form-markup" type="number" step="0.01" min="0"
                    value={form.markup_percent} onChange={(e) => setField('markup_percent', e.target.value)}
                    placeholder="فارغ = هامش الفئة/المؤسسة" className={INPUT_CLASS} dir="ltr" />
                </div>
              </div>

              {ratesError && (
                <p className="text-[11px] text-warning-400">تعذّر تحميل أسعار الصرف؛ لا يمكن حساب السعر المقترح الآن.</p>
              )}
              {form.cost_currency && rates && !rate && (
                <p className="text-[11px] text-warning-400">
                  لا يوجد سعر صرف مسجّل لـ {form.cost_currency} بعد — سجّله أولاً ليُحسب السعر المقترح.
                </p>
              )}
              {suggestion && (
                <div className="p-3 rounded-xl bg-accent-500/10 border border-accent-500/20 text-xs" aria-live="polite">
                  <p className="text-surface-300">
                    السعر المقترح بسعر الصرف الحالي:{' '}
                    <span className="text-accent-400 font-extrabold font-mono text-sm">{formatCurrency(suggestion.value)}</span>
                  </p>
                  <p className="text-surface-500 mt-1">
                    {suggestion.withMarkup
                      ? `= ${form.foreign_cost} ${form.cost_currency} × ${formatCurrency(rate)} × (1 + ${markup.value}% ${MARKUP_SOURCE_LABELS[markup.source]})`
                        + (Number(siteDefaults?.price_rounding) > 0 ? ` مقرّباً لأعلى إلى ${siteDefaults.price_rounding}` : '')
                      : `= التكلفة × سعر الصرف فقط (هامش المؤسسة غير معروف حالياً)`}
                  </p>
                  <p className="text-surface-500 mt-0.5">
                    للاطلاع فقط: سعر البيع لا يتغيّر إلا بما تكتبه في حقله أو عند تحديث الأسعار بسعر الصرف.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── العرض ── */}
          <section className="space-y-3">
            <SectionTitle>العرض في المتجر</SectionTitle>
            <div>
              <label htmlFor="part-form-image" className={LABEL_CLASS}>صورة القطعة</label>
              <div className="flex items-center gap-4">
                <input id="part-form-image" type="file" accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImage(file);
                      setImagePreview(URL.createObjectURL(file));
                    }
                  }}
                  className="flex-1 w-full text-xs text-surface-400 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary-600/10 file:text-primary-400 hover:file:bg-primary-600/20 file:cursor-pointer" />
                {imagePreview && (
                  <div className="w-12 h-12 rounded-xl border border-white/10 overflow-hidden flex-shrink-0 bg-surface-900">
                    <img src={imagePreview} alt="معاينة صورة القطعة" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface-950/40 border border-white/5">
              <input type="checkbox" id="part-form-is-featured" checked={form.is_featured}
                onChange={(e) => setField('is_featured', e.target.checked)} className={CHECKBOX_CLASS} />
              <label htmlFor="part-form-is-featured" className="text-xs font-semibold text-surface-200 cursor-pointer select-none">
                تمييز هذا المنتج في الصفحة الرئيسية (Featured Product)
              </label>
            </div>
          </section>

          {error && <div className={ERROR_BOX} role="alert">{error}</div>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className={BTN_SECONDARY}>
              إلغاء
            </button>
            <button type="submit" disabled={saving || blocked} className={BTN_PRIMARY}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'تحديث' : 'حفظ'}
            </button>
          </div>
        </form>
      )}

      {showAdjust && detail && (
        <StockAdjustModal
          part={detail}
          onClose={() => setShowAdjust(false)}
          onAdjusted={handleAdjusted}
        />
      )}
    </PartsModal>
  );
}
