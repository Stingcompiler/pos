import { useId, useState } from 'react';

/**
 * حقل اختيار ملف بنصوص عربية.
 *
 * عنصر الملف الأصلي يعرض «Choose File / No file chosen» بلغة المتصفح لا لغة
 * الصفحة، فيظهر بالإنجليزية داخل واجهة عربية. هنا يُخفى بصرياً (يبقى قابلاً
 * للتركيز ولقارئ الشاشة) ويُعرض زر عربي مع اسم الملف المختار.
 *
 * يقبل id وaccept وdisabled وonChange كالعنصر الأصلي، فيُستبدل به مباشرة.
 */
export default function FileInput({
  id, accept, onChange, disabled = false, buttonLabel, emptyLabel, className = '',
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [name, setName] = useState('');
  const isImage = String(accept || '').startsWith('image');
  const button = buttonLabel || (isImage ? 'اختر صورة' : 'اختر ملفاً');
  const empty = emptyLabel || (isImage ? 'لم تُختر صورة' : 'لم يُختر ملف');

  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`}>
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="peer sr-only"
        onChange={(event) => {
          setName(event.target.files?.[0]?.name || '');
          onChange?.(event);
        }}
      />
      <label
        htmlFor={inputId}
        className={`shrink-0 inline-flex items-center justify-center min-h-11 md:min-h-9 px-4 rounded-xl bg-primary-600/10 text-primary-400
          text-xs font-semibold cursor-pointer hover:bg-primary-600/20 transition-colors
          peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {button}
      </label>
      <span className="text-xs text-surface-400 truncate min-w-0" dir="auto">{name || empty}</span>
    </div>
  );
}
