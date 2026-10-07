import { useCallback, useEffect, useState } from 'react';
import { Edit2, Landmark, Loader2, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage, fetchAllPages } from '../../utils/api';
import { useAuth } from '../../context/useAuth';
import {
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  LoadingBlock,
  Notice,
  PRIMARY_BUTTON_CLASS,
  SectionCard,
} from './SettingsUi';

const EMPTY_FORM = { name: '', account_number: '', is_active: true };

/**
 * حسابات المحل البنكية (بنكك وغيره) التي تُستقبل عليها التحويلات.
 * تظهر النشطة منها في نقطة البيع، وتُستخدم في مطابقة التحويلات والمصروفات.
 */
export default function BankAccountsSection() {
  const { user } = useAuth();
  // الحذف للمدير فقط في الخادم؛ المشرف يعطّل الحساب بدل حذفه.
  const canDelete = user?.role === 'manager';

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setAccounts(await fetchAllPages('bank-accounts/'));
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'تعذّر تحميل الحسابات البنكية.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (account) => {
    setEditing(account);
    setForm({
      name: account.name,
      account_number: account.account_number || '',
      is_active: account.is_active,
    });
    setFormError('');
    setModalOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const payload = {
      name: form.name.trim(),
      account_number: form.account_number.trim(),
      is_active: form.is_active,
    };
    try {
      if (editing) {
        await api.put(`bank-accounts/${editing.id}/`, payload);
      } else {
        await api.post('bank-accounts/', payload);
      }
      setModalOpen(false);
      setActionError('');
      setMessage(editing ? 'تم تعديل الحساب البنكي.' : 'تمت إضافة الحساب البنكي.');
      loadAccounts();
    } catch (err) {
      setFormError(apiErrorMessage(err, 'تعذّر حفظ الحساب البنكي.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account) => {
    setBusyId(account.id);
    setActionError('');
    setMessage('');
    try {
      const { data } = await api.patch(`bank-accounts/${account.id}/`, { is_active: !account.is_active });
      setAccounts((prev) => prev.map((item) => (item.id === data.id ? data : item)));
    } catch (err) {
      setActionError(apiErrorMessage(err, 'تعذّر تغيير حالة الحساب.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (account) => {
    const confirmed = window.confirm(
      `حذف الحساب «${account.name}»؟\n`
      + 'يُسمح بالحذف فقط إن لم تُسجَّل عليه أي دفعة أو مصروف. الحساب المستخدم يُعطَّل بدل حذفه حتى يبقى سجلّه صحيحاً.',
    );
    if (!confirmed) return;
    setBusyId(account.id);
    setActionError('');
    setMessage('');
    try {
      await api.delete(`bank-accounts/${account.id}/`);
      setAccounts((prev) => prev.filter((item) => item.id !== account.id));
      setMessage('تم حذف الحساب البنكي.');
    } catch (err) {
      // الخادم يشرح سبب الرفض (للحساب دفعات مسجّلة...)؛ نعرضه كما هو.
      setActionError(apiErrorMessage(err, 'تعذّر حذف الحساب البنكي.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard
      icon={Landmark}
      title="الحسابات البنكية"
      description="الحسابات التي يستقبل عليها المحل التحويلات (مثل بنكك). النشطة منها تظهر للكاشير عند الدفع بالتحويل، وتُستخدم لمطابقة الإشعارات."
      actions={(
        <button type="button" onClick={openCreate} className={`${PRIMARY_BUTTON_CLASS} w-full sm:w-auto`}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>إضافة حساب</span>
        </button>
      )}
    >
      <Notice type="success">{message}</Notice>
      <Notice>{actionError}</Notice>

      {loading ? (
        <LoadingBlock label="جاري تحميل الحسابات البنكية..." />
      ) : loadError ? (
        <div className="space-y-3">
          <Notice>{loadError}</Notice>
          <button type="button" onClick={loadAccounts} className="text-sm text-primary-400 hover:text-primary-300 font-semibold">
            إعادة المحاولة
          </button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="py-10 text-center">
          <Landmark className="w-10 h-10 text-surface-600 mx-auto mb-3" aria-hidden="true" />
          <p className="font-bold text-white">لا توجد حسابات بنكية بعد</p>
          <p className="text-xs text-surface-400 mt-1">أضف حساب المحل حتى يتمكن الكاشير من تسجيل التحويلات عليه.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
          {accounts.map((account) => {
            const busy = busyId === account.id;
            return (
              <li
                key={account.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-surface-900/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{account.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        account.is_active
                          ? 'bg-success-500/10 text-success-400'
                          : 'bg-surface-700 text-surface-400'
                      }`}
                    >
                      {account.is_active ? 'نشط' : 'معطّل'}
                    </span>
                  </div>
                  <p className="text-xs text-surface-400 mt-1">
                    رقم الحساب:{' '}
                    {account.account_number ? (
                      <span dir="ltr" className="font-mono text-surface-300 select-all">{account.account_number}</span>
                    ) : (
                      <span>غير مسجّل</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleActive(account)}
                    disabled={busy}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-surface-900 border border-white/10 text-surface-300 hover:text-white transition-colors disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : account.is_active ? (
                      <PowerOff className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Power className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{account.is_active ? 'تعطيل' : 'تفعيل'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(account)}
                    disabled={busy}
                    aria-label={`تعديل الحساب ${account.name}`}
                    title="تعديل"
                    className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-600/10 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(account)}
                      disabled={busy}
                      aria-label={`حذف الحساب ${account.name}`}
                      title="حذف (فقط إن لم يُستخدم)"
                      className="p-2 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-md animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-account-dialog-title"
            className="w-full max-w-md glass-card p-6 space-y-5 animate-scale-in"
          >
            <div className="border-b border-white/5 pb-3">
              <h3 id="bank-account-dialog-title" className="text-lg font-bold text-white">
                {editing ? 'تعديل الحساب البنكي' : 'إضافة حساب بنكي'}
              </h3>
            </div>

            <form onSubmit={save} className="space-y-4">
              <Notice>{formError}</Notice>
              <div>
                <label htmlFor="bank-account-name" className={LABEL_CLASS}>اسم الحساب / البنك *</label>
                <input
                  id="bank-account-name"
                  type="text"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className={INPUT_CLASS}
                  placeholder="مثال: بنكك - بنك الخرطوم"
                />
                <p className={HINT_CLASS}>اسم مميّز يتعرّف عليه الكاشير (لا يتكرر).</p>
              </div>
              <div>
                <label htmlFor="bank-account-number" className={LABEL_CLASS}>رقم الحساب</label>
                <input
                  id="bank-account-number"
                  type="text"
                  dir="ltr"
                  maxLength={100}
                  value={form.account_number}
                  onChange={(event) => setForm({ ...form, account_number: event.target.value })}
                  className={`${INPUT_CLASS} text-left font-mono`}
                  placeholder="1234567"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="bank-account-active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                  className="w-4 h-4 rounded border-white/10 accent-primary-500 cursor-pointer"
                />
                <label htmlFor="bank-account-active" className="text-sm text-surface-300 cursor-pointer select-none">
                  نشط (يظهر في نقطة البيع)
                </label>
              </div>

              <div className="flex gap-3 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 h-10 rounded-xl bg-surface-900 text-surface-300 text-sm hover:bg-surface-700 transition-colors"
                >
                  إلغاء
                </button>
                <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON_CLASS} flex-1`}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  <span>حفظ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
