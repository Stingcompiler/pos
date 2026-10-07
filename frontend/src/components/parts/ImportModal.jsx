import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Download, Eye, FileSpreadsheet, Loader2, Upload,
} from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage, downloadFile } from '../../utils/api';
import PartsModal from './PartsModal';
import {
  BTN_PRIMARY, BTN_SECONDARY, CHECKBOX_CLASS, ERROR_BOX, INFO_BOX, LABEL_CLASS, SUCCESS_BOX,
} from './styles';

// آلاف الأخطاء في ملف كبير تجمّد الجدول؛ نعرض أولها ونذكر العدد الكلي.
const MAX_ERRORS_SHOWN = 200;

/**
 * استيراد القطع من Excel/CSV على مرحلتين: معاينة (dry_run=1) ثم تطبيق.
 *
 * التطبيق متاح فقط لمعاينة بلا أخطاء وللملف والخيارات نفسها التي عوينت؛
 * تغيير الملف أو خيار التحديث يُلغي المعاينة السابقة.
 */
export default function ImportModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const resetPreview = () => {
    setPreview(null);
    setResult(null);
    setError('');
  };

  const upload = (dryRun) => {
    const data = new FormData();
    data.append('file', file);
    data.append('dry_run', dryRun ? '1' : '0');
    data.append('update_existing', updateExisting ? '1' : '0');
    return api.post('spare-parts/import/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };

  const handlePreview = async () => {
    if (!file) return;
    setBusy('preview');
    resetPreview();
    try {
      const { data } = await upload(true);
      setPreview(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّرت قراءة الملف.'));
    } finally {
      setBusy('');
    }
  };

  const handleApply = async () => {
    setBusy('apply');
    setError('');
    try {
      const { data } = await upload(false);
      if (data.applied) {
        setResult(data);
        onImported(data);
      } else {
        setPreview(data);
        setError(data.detail || 'لم يُطبَّق الاستيراد.');
      }
    } catch (err) {
      // رفض التطبيق بسبب أخطاء يعيد جسم المعاينة نفسه: نحدّث الجدول بها.
      const body = err.response?.data;
      if (body && Array.isArray(body.errors)) setPreview(body);
      setError(apiErrorMessage(err, 'تعذّر تطبيق الاستيراد.'));
    } finally {
      setBusy('');
    }
  };

  const handleTemplate = async () => {
    setBusy('template');
    setError('');
    try {
      await downloadFile('spare-parts/import-template/', 'parts-template.xlsx');
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر تحميل القالب.'));
    } finally {
      setBusy('');
    }
  };

  const errors = preview?.errors || [];
  const warnings = preview?.warnings || [];
  const rowsToApply = (preview?.create_count || 0) + (preview?.update_count || 0);
  const canApply = Boolean(preview) && !result && errors.length === 0 && rowsToApply > 0;

  return (
    <PartsModal title="استيراد قطع الغيار من Excel" onClose={onClose} maxWidth="max-w-3xl" busy={busy === 'apply'}>
      <div className="space-y-4">
        <div className={INFO_BOX}>
          <p className="font-semibold mb-1">كيف يعمل الاستيراد؟</p>
          <ul className="list-disc pr-5 space-y-0.5">
            <li>رقم القطعة هو المفتاح: رقم جديد = قطعة جديدة برصيدها الافتتاحي من عمود الكمية.</li>
            <li>
              القطع الموجودة لا يتغيّر رصيدها ولا متوسط تكلفتها بالاستيراد أبداً — يُحدَّث وصفها
              وسعر بيعها فقط عند اختيار «تحديث القطع الموجودة». لتصحيح الرصيد استخدم الجرد أو تسوية الرصيد.
            </li>
            <li>الفئة غير الموجودة تُنشأ تلقائياً. لا يُحفظ أي صف قبل المعاينة والتأكيد.</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label htmlFor="parts-import-file" className={LABEL_CLASS}>ملف Excel أو CSV *</label>
            <input
              id="parts-import-file"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              disabled={Boolean(busy)}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                resetPreview();
              }}
              className="w-full text-xs text-surface-400 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary-600/10 file:text-primary-400 hover:file:bg-primary-600/20 file:cursor-pointer"
            />
          </div>
          <button type="button" onClick={handleTemplate} disabled={Boolean(busy)} className={BTN_SECONDARY}>
            {busy === 'template' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            تحميل القالب
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="parts-import-update-existing"
            type="checkbox"
            checked={updateExisting}
            disabled={Boolean(busy)}
            onChange={(e) => {
              setUpdateExisting(e.target.checked);
              resetPreview();
            }}
            className={CHECKBOX_CLASS}
          />
          <label htmlFor="parts-import-update-existing" className="text-xs font-semibold text-surface-200 cursor-pointer">
            تحديث القطع الموجودة (الاسم، الوصف، سعر البيع...) — دون المساس بالرصيد أو التكلفة
          </label>
        </div>

        {error && <div className={ERROR_BOX} role="alert">{error}</div>}

        {result && (
          <div className={`${SUCCESS_BOX} flex items-start gap-2`} role="status">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              تم الاستيراد: أُنشئت {result.create_count} قطعة، وحُدِّثت {result.update_count}
              {result.skipped_count > 0 && `، وتُركت ${result.skipped_count} قطعة موجودة دون تغيير`}.
            </span>
          </div>
        )}

        {preview && !result && (
          <div className="space-y-3" aria-live="polite">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <SummaryCard label="ستُنشأ" value={preview.create_count} tone="text-success-400" />
              <SummaryCard label="ستُحدَّث" value={preview.update_count} tone="text-primary-300" />
              <SummaryCard label="موجودة وستُترك" value={preview.skipped_count} tone="text-surface-300" />
              <SummaryCard label="صفوف بها أخطاء" value={errors.length} tone={errors.length ? 'text-danger-400' : 'text-surface-300'} />
            </div>

            {errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-danger-400 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  صحّح هذه الصفوف في الملف ثم أعد رفعه — لن يُطبَّق الاستيراد وفيه أخطاء.
                </p>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-danger-500/20">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-900">
                      <tr className="text-surface-400 border-b border-white/5">
                        <th scope="col" className="px-3 py-2 text-right font-medium w-16">الصف</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium w-36">رقم القطعة</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">الأخطاء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.slice(0, MAX_ERRORS_SHOWN).map((item) => (
                        <tr key={item.row} className="border-b border-white/3 align-top">
                          <td className="px-3 py-2 font-mono text-white">{item.row}</td>
                          <td className="px-3 py-2 font-mono text-surface-300" dir="ltr">{item.part_number || '-'}</td>
                          <td className="px-3 py-2 text-danger-400">
                            <ul className="space-y-0.5">
                              {item.messages.map((message, index) => (
                                <li key={index}>{message}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {errors.length > MAX_ERRORS_SHOWN && (
                  <p className="mt-1 text-[11px] text-surface-500">
                    يُعرض أول {MAX_ERRORS_SHOWN} صف من {errors.length} صفاً بها أخطاء.
                  </p>
                )}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-warning-500/10 border border-warning-500/20 text-warning-400 text-xs">
                <p className="font-semibold mb-1">تنبيهات (لا تمنع الاستيراد):</p>
                <ul className="list-disc pr-5 space-y-0.5 max-h-32 overflow-y-auto">
                  {warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {errors.length === 0 && preview.preview?.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-white/5">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-900">
                    <tr className="text-surface-400 border-b border-white/5">
                      <th scope="col" className="px-3 py-2 text-right font-medium w-16">الصف</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">القطعة</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium w-24">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((item) => (
                      <tr key={`${item.action}-${item.row}`} className="border-b border-white/3">
                        <td className="px-3 py-1.5 font-mono text-surface-400">{item.row}</td>
                        <td className="px-3 py-1.5 text-surface-200">
                          {item.name} <span className="font-mono text-surface-500" dir="ltr">{item.part_number}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={item.action === 'create' ? 'text-success-400' : 'text-primary-300'}>
                            {item.action === 'create' ? 'إنشاء' : 'تحديث'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {errors.length === 0 && rowsToApply === 0 && (
              <p className="text-xs text-surface-400">لا توجد صفوف للإنشاء أو التحديث في هذا الملف.</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={busy === 'apply'} className={BTN_SECONDARY}>
            {result ? 'إغلاق' : 'إلغاء'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={!file || Boolean(busy)}
              className={BTN_SECONDARY}
            >
              {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {preview ? 'إعادة المعاينة' : 'معاينة'}
            </button>
          )}
          {!result && (
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply || Boolean(busy)}
              className={BTN_PRIMARY}
              title={preview && errors.length > 0 ? 'صحّح الأخطاء أولاً' : undefined}
            >
              {busy === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              تطبيق الاستيراد
            </button>
          )}
        </div>
        {!preview && !result && (
          <p className="text-[11px] text-surface-500 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            اختر الملف ثم «معاينة» لرؤية ما سيُنشأ ويُحدَّث قبل الحفظ.
          </p>
        )}
      </div>
    </PartsModal>
  );
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className="p-3 rounded-xl bg-surface-950/40 border border-white/5 text-center">
      <p className={`text-lg font-extrabold font-mono ${tone}`}>{value ?? 0}</p>
      <p className="text-[11px] text-surface-400">{label}</p>
    </div>
  );
}
