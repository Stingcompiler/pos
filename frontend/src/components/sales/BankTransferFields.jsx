import { useId } from 'react';
import { Loader2 } from 'lucide-react';
import useActiveBankAccounts from './useActiveBankAccounts';

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10';

/**
 * حقول التحويل البنكي: حساب المحل (من bank-accounts/?active=1)، رقم الإشعار،
 * ورقم حساب المرسل عند الحاجة. إن لم تُعرَّف حسابات بعد يُكتب اسم البنك يدوياً.
 */
export default function BankTransferFields({ value, onChange, requireSender = false, accountLabel = 'الحساب البنكي *' }) {
  const ids = useId();
  const { accounts, loading, error } = useActiveBankAccounts();
  const manualName = !loading && accounts.length === 0;

  return (
    <div className="space-y-3 p-3 rounded-xl bg-primary-600/5 border border-primary-500/15">
      {loading ? (
        <p className="text-xs text-surface-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> جارٍ تحميل الحسابات البنكية…
        </p>
      ) : manualName ? (
        <div>
          <label htmlFor={`${ids}-bank-name`} className="block text-xs font-semibold text-surface-300 mb-1">
            اسم البنك *
          </label>
          <input
            id={`${ids}-bank-name`}
            type="text"
            value={value.bankName}
            onChange={(e) => onChange({ bankName: e.target.value })}
            className={inputClass}
            placeholder="مثال: بنكك"
          />
          {error && <p className="mt-1 text-[11px] text-warning-400">{error}</p>}
        </div>
      ) : (
        <div>
          <label htmlFor={`${ids}-bank-account`} className="block text-xs font-semibold text-surface-300 mb-1">
            {accountLabel}
          </label>
          <select
            id={`${ids}-bank-account`}
            value={value.bankAccount}
            onChange={(e) => onChange({ bankAccount: e.target.value })}
            className={inputClass}
          >
            <option value="">-- اختر الحساب --</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}{account.account_number ? ` (${account.account_number})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={`grid gap-3 ${requireSender ? 'sm:grid-cols-2' : ''}`}>
        <div>
          <label htmlFor={`${ids}-reference`} className="block text-xs font-semibold text-surface-300 mb-1">
            رقم الإشعار *
          </label>
          <input
            id={`${ids}-reference`}
            type="text"
            dir="ltr"
            value={value.referenceId}
            onChange={(e) => onChange({ referenceId: e.target.value })}
            className={`${inputClass} font-mono`}
          />
        </div>
        {requireSender && (
          <div>
            <label htmlFor={`${ids}-sender`} className="block text-xs font-semibold text-surface-300 mb-1">
              رقم حساب المرسل *
            </label>
            <input
              id={`${ids}-sender`}
              type="text"
              dir="ltr"
              value={value.senderAccount}
              onChange={(e) => onChange({ senderAccount: e.target.value })}
              className={`${inputClass} font-mono`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
