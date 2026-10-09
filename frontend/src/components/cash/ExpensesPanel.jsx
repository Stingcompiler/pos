import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, Plus, Receipt, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage, fetchAllPages } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { EXPENSE_CATEGORIES, parseMoneyInput, toCents } from './cashMath';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from './PageStates';

const EMPTY_FORM = { category: '', amount: '', method: 'cash', bankAccount: '', description: '' };

const inputClass = 'w-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500 h-10 disabled:opacity-50';

/**
 * مصروفات اليوم: إضافة وحذف. اليوم المُقفل لا تتغير مصروفاته (الخادم يرفض
 * أيضاً)، والحذف للمدير فقط لأن المشرف لا يملك صلاحية الحذف في النظام.
 */
export default function ExpensesPanel({
  date, expenses, status, error, onRetry, closed, canDelete, onChanged,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [listError, setListError] = useState('');

  const [accounts, setAccounts] = useState([]);
  const [accountsStatus, setAccountsStatus] = useState('loading');

  // الحسابات النشطة فقط: لا يُسجَّل مصروف جديد على حساب معطّل.
  const loadAccounts = useCallback(() => fetchAllPages('bank-accounts/', { active: 1 })
    .then((rows) => {
      setAccounts(rows);
      setAccountsStatus('ready');
    })
    .catch(() => setAccountsStatus('error')), []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const retryAccounts = () => {
    setAccountsStatus('loading');
    loadAccounts();
  };

  const update = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    const amount = parseMoneyInput(form.amount);
    if (!form.category.trim()) {
      setFormError('اكتب بند المصروف.');
      return;
    }
    if (amount === null || toCents(amount) <= 0) {
      setFormError('أدخل مبلغاً صحيحاً أكبر من صفر.');
      return;
    }
    if (form.method === 'bank' && !form.bankAccount) {
      setFormError('اختر الحساب البنكي الذي دُفع منه المصروف.');
      return;
    }

    setSaving(true);
    try {
      await api.post('expenses/', {
        date,
        category: form.category.trim(),
        amount,
        method: form.method,
        bank_account: form.method === 'bank' ? Number(form.bankAccount) : null,
        description: form.description.trim(),
      });
      // نُبقي الطريقة والحساب: المصروفات المتتالية غالباً من نفس المصدر.
      setForm((prev) => ({ ...EMPTY_FORM, method: prev.method, bankAccount: prev.bankAccount }));
      await onChanged();
    } catch (err) {
      setFormError(apiErrorMessage(err, 'تعذّر حفظ المصروف.'));
    }
    setSaving(false);
  };

  const handleDelete = async (expense) => {
    const ok = window.confirm(
      `حذف مصروف «${expense.category}» بمبلغ ${formatCurrency(expense.amount)}؟ لا يمكن التراجع.`,
    );
    if (!ok) return;
    setDeletingId(expense.id);
    setListError('');
    try {
      await api.delete(`expenses/${expense.id}/`);
      await onChanged();
    } catch (err) {
      setListError(apiErrorMessage(err, 'تعذّر حذف المصروف.'));
    }
    setDeletingId(null);
  };

  const total = expenses.reduce((sum, expense) => sum + toCents(expense.amount), 0) / 100;
  const showDelete = canDelete && !closed;

  return (
    <section className="glass-card overflow-hidden" aria-labelledby="expenses-title">
      <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
        <h2 id="expenses-title" className="text-sm font-bold text-white flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary-400" aria-hidden="true" />
          مصروفات اليوم
        </h2>
        {status === 'ready' && expenses.length > 0 && (
          <span className="text-xs text-surface-400">
            الإجمالي: <strong className="text-white tabular-nums">{formatCurrency(total)}</strong>
          </span>
        )}
      </div>

      {closed ? (
        <p className="m-4 flex items-center gap-2 text-xs text-surface-400 bg-surface-900/50 border border-white/5 rounded-xl p-3">
          <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
          اليوم مُقفل: لا تُضاف أو تُحذف مصروفاته. أعد فتح اليوم (المدير) لتعديلها.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="p-4 border-b border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3" noValidate>
          <div>
            <label htmlFor="expense-category" className="block text-xs font-semibold text-surface-300 mb-1">البند *</label>
            <input
              id="expense-category"
              type="text"
              list="expense-category-options"
              value={form.category}
              onChange={update('category')}
              maxLength={100}
              className={inputClass}
              placeholder="إيجار، كهرباء، ترحيل…"
            />
            <datalist id="expense-category-options">
              {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="expense-amount" className="block text-xs font-semibold text-surface-300 mb-1">المبلغ *</label>
            <input
              id="expense-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              dir="ltr"
              value={form.amount}
              onChange={update('amount')}
              className={`${inputClass} text-left tabular-nums`}
              placeholder="0.00"
            />
          </div>
          <div>
            <label htmlFor="expense-method" className="block text-xs font-semibold text-surface-300 mb-1">طريقة الدفع</label>
            <select id="expense-method" value={form.method} onChange={update('method')} className={inputClass}>
              <option value="cash">نقدي من الدرج</option>
              <option value="bank">تحويل من حساب بنكي</option>
            </select>
          </div>
          {form.method === 'bank' ? (
            <div>
              <label htmlFor="expense-bank" className="block text-xs font-semibold text-surface-300 mb-1">الحساب البنكي *</label>
              {accountsStatus === 'error' ? (
                <div className="flex items-center gap-2 h-10 text-xs text-danger-400">
                  تعذّر تحميل الحسابات.
                  <button type="button" onClick={retryAccounts} className="underline cursor-pointer">إعادة المحاولة</button>
                </div>
              ) : (
                <select
                  id="expense-bank"
                  value={form.bankAccount}
                  onChange={update('bankAccount')}
                  disabled={accountsStatus === 'loading'}
                  className={inputClass}
                >
                  <option value="">{accountsStatus === 'loading' ? 'جارٍ التحميل…' : 'اختر الحساب'}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}{account.account_number ? ` — ${account.account_number}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="hidden sm:block" aria-hidden="true" />
          )}
          <div className="sm:col-span-2">
            <label htmlFor="expense-description" className="block text-xs font-semibold text-surface-300 mb-1">الوصف</label>
            <input
              id="expense-description"
              type="text"
              value={form.description}
              onChange={update('description')}
              maxLength={255}
              className={inputClass}
              placeholder="تفاصيل اختيارية (مثلاً: ترحيل طلبية الخرطوم بحري)"
            />
          </div>
          {formError && <div className="sm:col-span-2"><InlineAlert>{formError}</InlineAlert></div>}
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl gradient-primary text-white text-sm font-semibold transition flex items-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
              إضافة المصروف
            </button>
          </div>
        </form>
      )}

      {listError && <div className="p-4 pb-0"><InlineAlert onDismiss={() => setListError('')}>{listError}</InlineAlert></div>}

      {status === 'loading' ? (
        <LoadingState compact label="جارٍ تحميل المصروفات…" />
      ) : status === 'error' ? (
        <ErrorState compact message={error} onRetry={onRetry} />
      ) : expenses.length === 0 ? (
        <EmptyState compact icon={Receipt} title="لا توجد مصروفات مسجّلة لهذا اليوم" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-white/5 text-surface-400 text-xs">
                <th scope="col" className="p-3 font-semibold">البند</th>
                <th scope="col" className="p-3 font-semibold">المبلغ</th>
                <th scope="col" className="p-3 font-semibold">الطريقة</th>
                <th scope="col" className="p-3 font-semibold">الوصف</th>
                <th scope="col" className="p-3 font-semibold">بواسطة</th>
                {showDelete && <th scope="col" className="p-3"><span className="sr-only">إجراءات</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-surface-200">
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="p-3 font-semibold text-white">{expense.category}</td>
                  <td className="p-3 tabular-nums font-semibold">{formatCurrency(expense.amount)}</td>
                  <td className="p-3 text-xs">
                    {expense.method === 'bank'
                      ? <span className="text-primary-300">تحويل — {expense.bank_account_name || 'حساب بنكي'}</span>
                      : <span className="text-surface-300">نقدي</span>}
                  </td>
                  <td className="p-3 text-xs text-surface-400">{expense.description || '—'}</td>
                  <td className="p-3 text-xs text-surface-400">{expense.created_by_name}</td>
                  {showDelete && (
                    <td className="p-3 text-left">
                      <button
                        type="button"
                        onClick={() => handleDelete(expense)}
                        disabled={deletingId === expense.id}
                        aria-label={`حذف مصروف ${expense.category}`}
                        title="حذف"
                        className="p-1.5 rounded-lg bg-danger-600/10 hover:bg-danger-600/20 text-danger-400 transition disabled:opacity-50 cursor-pointer"
                      >
                        {deletingId === expense.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
