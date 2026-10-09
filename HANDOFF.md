# ملف تسليم — نظام نقطة بيع قطع غيار السيارات

> **آخر تحديث**: 2026-09-23
> **الغرض**: تمكين نافذة جديدة من متابعة العمل بلا إعادة استكشاف.
> **المستودع**: https://github.com/Stingcompiler/pos.git

---

## 1. الحالة الحالية — مُتحقَّق منها جميعاً (لا تقديرات)

```
$ .venv/bin/python --version
Python 3.13.13

$ .venv/bin/python -c "import django; print(django.get_version())"
5.2.17

$ .venv/bin/python manage.py test api
Ran 81 tests in 0.937s
OK                                                ← TESTS_EXIT=0

$ DJANGO_DEBUG=False .venv/bin/python manage.py check --deploy
System check identified no issues (0 silenced).   ← DEPLOY_EXIT=0

$ cd frontend && npm run lint
(بلا أي إخراج)                                    ← LINT_EXIT=0

$ npm run build
vite v8.0.3 — 2213 modules transformed — built in 689ms
PWA generateSW — precache 16 entries (1323.14 KiB) ← BUILD_EXIT=0

$ makemigrations --check --dry-run
No changes detected                              ← لا ترحيلات معلّقة
```

**الأزمنة**: اختبارات الباك إند ~0.9 ثانية، بناء الواجهة ~0.7 ثانية.

**تشغيل حقيقي مُتحقَّق منه**: شُغِّل Django على 8000 وVite على 5173، وفُحصت
نقاط النهاية فعلاً: `/api/public/settings/` و`/parts/` و`/featured-parts/`
← 200، و`/api/auth/me/` بلا مصادقة ← 401، وتسجيل دخول خاطئ ← 401، والواجهة
← 200، وهي تصل إلى الـ API عبر بروكسي Vite (200 بأربعة مفاتيح صحيحة).

> **تنبيه بيئي**: البيئة أُعيد بناؤها على **Python 3.13** (كانت 3.12 عند
> إنشاء الترحيلات). كل شيء يعمل، لكن إن ظهر خلل في الترحيلات فتحقّق من هذا
> أولاً. Django 5.2.17، Vite 8.0.3.

---

## 2. ما هو المشروع

نظام متكامل لإدارة محل قطع غيار سيارات: نقطة بيع، مخزون، فواتير، موردون،
تقارير أرباح، ومتجر إلكتروني عام مرتبط بالمخزون نفسه. الواجهة عربية RTL
ومهيّأة كـ PWA.

| الطبقة | التقنية |
|--------|----------|
| الباك إند | Django 5.2 + DRF |
| المصادقة | JWT داخل كوكيز HttpOnly + تدوير توكنات + blacklist |
| قاعدة البيانات | SQLite افتراضياً — PostgreSQL عند ضبط `DB_NAME` |
| الواجهة | React 19 + Vite 8 + Tailwind 4 |
| خدمة الملفات الثابتة | WhiteNoise |

**الأدوار**: مدير (`manager`) — مشرف (`supervisor`) — موظف (`employee`).

---

## 3. المبدأ المعماري الذي لا يجوز كسره

**لا يُعدَّل المخزون إلا عبر `backend/api/services.py`**، داخل
`transaction.atomic` مع `select_for_update`.

مصدر الحقيقة الوحيد للكمية هو `SparePart.stock_quantity`، وكل تغيير عليها
يُسجَّل في `StockMovement` (سجل تدقيقي غير قابل للتعديل).

أي كتابة `part.stock_quantity -= n` في `views.py` أو `serializers.py` أو
`save()` تُعيد السباقات والخصم المزدوج الذي بُني هذا التصميم لمنعه.

**قواعد مصاحبة**:
- `InvoiceItem.cost_price` **لقطة** وقت البيع — لا تُحدَّث لاحقاً أبداً،
  لأن تقارير الربح التاريخية تعتمد عليها.
- `SparePart.stock_quantity` للقراءة فقط عبر الـ API.
- الـ API تعيد السعر من الخادم دائماً؛ تمرير سعر من العميل يُتجاهل إلا
  لمدير/مشرف (`allow_price_override`).

---

## 4. ما أُنجز (النافذة السابقة)

### أ) الباك إند — إصلاحات أمنية ووظيفية (المرحلة الأولى مكتملة)

| المرجع | الإصلاح | الملف |
|---|---|---|
| P0-1 | منع `confirmed → pending` في الطلبات الخارجية (كان يُفسد المخزون بخصم مزدوج) | `api/views.py` |
| P0-2 | `SECURE_SSL_REDIRECT` افتراضيه `True` | `core/settings.py` |
| P0-3 | إزالة بريد شخصي مكتوب في الكود | `core/settings.py` |
| P0-4 | `AUTH_COOKIE_DOMAIN` + تصحيح `_clear_auth_cookies` (كان يحذف بلا دومين فتعلق الكوكي) | `core/settings.py`، `api/views.py` |
| P1-1 | تطبيق `AUTH_PASSWORD_VALIDATORS` فعلياً (كانت كوداً ميتاً) | `api/serializers.py` |
| P1-2 | `from datetime import timedelta` بدل `timezone.timedelta` | `api/views.py` |
| P1-5 | التحقق من حجم/أبعاد/صيغة الصور | `api/validators.py` (جديد)، `api/models.py` |
| P1-6 | معالجات 404/500 عربية | `core/views.py` (جديد)، `templates/errors/*` |
| P1-7 | `DASHBOARD_BASE_URL` بلا localhost | `core/settings.py`، `api/signals.py` |
| P2-6 | فصل عمر كوكي الوصول (30 د) عن التحديث (7 أيام) | `core/settings.py`، `api/views.py` |

**اختبارات جديدة**: +13 (من 54 إلى 67) في ثلاث فئات:
`PublicOrderStatusTransitionTests`، `PasswordPolicyTests`،
`ImageUploadValidationTests`.

**ترحيل جديد**: `api/migrations/0014_alter_carmodel_image_....py`.

### ب) تنظيف المستودع (P0-5)

| البند | الحالة |
|---|---|
| `backend/.env`، `db.sqlite3`، `__pycache__/*.pyc` | أُزيلت من الفهرس |
| `frontend/.env` | أُزيل من الفهرس — **باقٍ على القرص**؛ أُنشئ `frontend/.env.example` |
| `frontend/dist/` | أُزيل من الفهرس — **باقٍ على القرص** (يُعاد توليده) |
| `/media/` في `backend/.gitignore` | **فُعِّلت** — الرفوعات المستقبلية لا تُضاف تلقائياً، والصور الأولية تبقى متعقّبة (`.gitignore` لا يُلغي تعقّب موجود) |

### ج) بنية وإعدادات جديدة

- `.github/workflows/ci.yml` — يشغّل `check --deploy` بـ`DJANGO_DEBUG=False`
  ثم الاختبارات ثم lint ثم build على كل دفعة وطلب دمج.
- `README.md` في الجذر — التشغيل، الاختبارات، متغيّرات البيئة، النشر.
- `backend/.env.example` محدَّث بمتغيّرات الكوكي والـHTTPS والرابط.
- `REVIEW.md` — تقرير المراجعة الكامل (7 أقسام) في الجذر.

### د) بنود المرحلة الثانية المُنفَّذة (جولة لاحقة)

نُفِّذت هذه البنود لاحقاً، وكل واحد مغطّى باختبار — فالتفاصيل الكاملة في
`REVIEW.md` §7هـ:

| المرجع | الإصلاح | التحقق |
|---|---|---|
| **P1-3** | فرع تسجيل الدخول الميت: الحساب المعطّل ← 403 «غير مفعل» بدل 401 | 3 اختبارات (صحيحة←403، خاطئة←401، اسم مجهول←401) |
| **P1-8** | تحذير مبكر من نقص المخزون في الطلبات العامة (بلا منع الطلب) | 2 اختباران |
| **P2-2** | فهارس `Notification.is_read`، `PublicOrder.status`، `SparePart.is_featured` | ترحيل `0015` |
| **P2-3** | `purchase_price` للقراءة فقط عند التحديث (مطلوب عند الإنشاء) | 4 اختبارات |
| **P2-4** | لقطة `cost_price` في `PublicOrderItem` (ولا تُكشف للواجهة العامة) | 2 اختباران |
| **P2-5** | `PROTECT` بدل `CASCADE` على `StockMovement.spare_part` | 4 اختبارات |

**إضافة مصاحبة لازمة**: `ProtectedDeleteMixin` في `api/views.py` يحوّل
`ProtectedError` إلى **400 برسالة عربية** بدل خطأ 500. كان هذا الخطر قائماً
أصلاً عبر `InvoiceItem.spare_part`؛ الـPROTECT الجديد وسّعه. مطبَّق على
`UserViewSet` و`CategoryViewSet` و`SparePartViewSet`.

**اختبارات النافذة**: من 67 إلى **81**.

### هـ) ملفات أخرى في الجذر (لم أنشئها في هذه النافذة)

- `INTEGRATION-CHECKLIST.md`
- `vezano-brand-identity.md` / `.pdf` — هوية بصرية لمشروع «Vezano».
  **لا علاقة مباشرة لها بهذا المستودع** — إن كانت لمرحلة لاحقة، فهي لم تُربط
  بأي كود بعد.

---

## 5. بنية الملفات المهمة

```
backend/
  core/
    settings.py       كل الإعدادات؛ إعدادات الأمان الإنتاجية داخل `if not DEBUG:`
    urls.py           handler404/handler500 + خدمة SPA + /media/
    views.py          custom_404 / custom_500
  api/
    services.py       ← منطق المخزون كله (ذرّي + select_for_update)
    models.py         النماذج — بلا تعديل مخزون في save()
    serializers.py    التحقق + تحويل الحمولات
    views.py          نقاط النهاية (784 سطراً — مرشّح للتقسيم، P2-1)
    signals.py        إشعارات إدارية (تنبيه داخلي + بريد، عبر on_commit)
    validators.py     التحقق من الصور
    tests.py          81 اختباراً
  templates/errors/   404.html، 500.html (مستقلة بتنسيق داخلي)
frontend/
  src/context/        authContext.js + AuthProvider.jsx + useAuth.js
                      cartContext.js + CartProvider.jsx + useCart.js
                      (التقسيم ثلاثة ملفات إجباري — انظر الدروس أدناه)
  src/pages/          صفحات النظام والمتجر
  src/api/axios.js    interceptors (تحديث التوكن + طابور الطلبات المتوقفة)
  src/api/media.js    mediaUrl — لا نطاق مكتوب في أي مكوّن
---

## 6. أوامر العمل اليومية

```bash
# الباك إند
cd backend
source .venv/bin/activate
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver --noreload    # :8000
.venv/bin/python manage.py test api                # 81 اختباراً

# فحص الإعدادات الإنتاجية — يجب أن يكون DEBUG=False وإلا لا يكشف شيئاً
DJANGO_DEBUG=False .venv/bin/python manage.py check --deploy

# الواجهة
cd frontend
npm run dev                                    # :5173
npm run lint
npm run build
```

**محلياً** `backend/.env` يضبط `DJANGO_DEBUG=True` — لذا `check --deploy`
يُخرج 5 تحذيرات محلياً. هذا **سلوك صحيح**، وليست مشكلة. في CI لا يوجد `.env`
فيمرّ نظيفاً ويتحقّق من الإعدادات الإنتاجية فعلاً.

---

## 7. ما لم يُنفَّذ بعد (التفصيل الكامل في `REVIEW.md`)

### المرحلة الثانية — أولوية عالية

| المرجع | العمل | لماذا لم يُنفَّذ بعد |
|---|---|---|
| **P1-4** | ترقيم الكتالوج العام (`public_parts_list`، `public_featured_parts`) | يتطلّب تعديل الباك إند **والواجهة معاً** (`FilterPage` يقرأ قائمة مسطّحة حالياً) — أي تعديل أحادي يكسر المتجر |
| **P2-1** | تقسيم `views.py` (784 سطراً) إلى حزمة `views/` | تغيير بنيوي واسع — الاختبارات الـ81 هي شبكة الأمان، وتُشغَّل بعد كل ملف يُنقل. يتطلّب `views/__init__.py` يعيد تصدير كل الأسماء حتى لا ينكسر `api/urls.py` |
| **P2-7** | اختبارات الفرونت إند (**صفر حالياً**) | الأولوية: `CartContext` (يحسب مبالغ مالية)، `ProtectedRoute`، `mediaUrl`. يتطلّب إضافة `vitest` + `@testing-library/react` |
| **P2-8** | سياسة بيانات عملاء الطلبات للموظف | قرار تصميمي يحتاج قرار المالك (هل يحتاج الموظف بيانات العميل للاتصال به؟) |

### المرحلة الثالثة

TypeScript (P3-1) · حزمة الأيقونات **618 كيلوبايت / 154 مضغوطة** (P3-2) ·
Sentry (P3-3) · Dockerfile (P3-6) · نطاقات إنتاج مكتوبة في الكود (P3-7) ·
تدقيق a11y (P3-9).

---

## 8. عمل عاجل لا يمكن للكود فعله (مسؤولية المالك)

**إبطال الأسرار التي كانت في تاريخ git.** إزالتها من الفهرس **لا تُلغيها من
التاريخ**:

```bash
git log --all --diff-filter=D -- backend/db.sqlite3
git show <commit>:backend/.env
```

المطلوب بالترتيب:
1. تغيير `EMAIL_HOST_PASSWORD` إن كان حساباً حقيقياً.
2. تغيير كلمات مرور أي مستخدم كان في `db.sqlite3` القديمة.
3. (اختياري، **تخريبي**) تطهير التاريخ بـ`git filter-repo` + force-push —
   **قرار المالك**، أو جعل المستودع خاصاً.

لا أُجريت هذه الخطوة لأنها غير قابلة للتراجع على مستودع مشترك.

---

## 9. دروس واجهتها في هذا المشروع (لتوفير الوقت)

1. **`react-refresh/only-export-components` لا تسمح بـ`createContext` في ملف
   مكوّن** حتى مع `allowConstantExport: true`. لذا كل Context **ثلاث ملفات**:
   كائن خام + Provider + Hook. لا تُحاول دمجها — جرّبتُ ولم تنجح.
2. **لا تُسمِّ ملفات بأسماء تختلف بالحالة فقط** (`AuthContext.jsx` مقابل
   `authContext.js`) — نظام macOS غير حسّاس للحالة فيسبب لبساً حقيقياً.
3. **`check --deploy` بلا `DEBUG=False` عبث** — كل التحذيرات تختفي لأن
   الإعدادات الإنتاجية داخل `if not DEBUG:`.
4. **DRF `ImageField` يتحقق من كون الملف صورة** لكنه **لا** يتحقق من الحجم
   ولا الأبعاد — ولهذا وُجد `validators.py` مربوطاً بالنموذج (يحمي لوحة
   إدارة Django أيضاً، لا السيريالايزر وحده).
5. **`AUTH_PASSWORD_VALIDATORS` إعداد سلبي** — لا يعمل إلا عند استدعاء
   `validate_password()` صراحةً على أي مسار إنشاء مستخدم مخصّص. وجوده في
   `settings.py` وحده لا يحمي شيئاً (وهذا كان خللاً حقيقياً).
6. **`.gitignore` لا يُلغي تعقّب ملف موجود** — لإخراج ملف من التتبّع مع إبقائه
   على القرص، استخدم `git rm --cached`.
7. **قراءة ملفات `/tmp`** تحتاج مساراً نسبياً مع تصعيد:
   `../../../../tmp/<name>` من جذر المشروع. `read_file` لا يقبل مساراً مطلقاً.
8. **التقاط مخرجات الأوامر الطويلة غير موثوق** في هذه البيئة (ظهر مرة
   «Ran 7 tests» بدل 67 بسبب اقتطاع/تشابك). اكتب النتيجة إلى ملف في `/tmp`
   ثم اقرأه — هذه هي الطريقة الموثوقة.
9. **`write_to_file` قد يُسقط الامتداد** — كُتب `README.md` باسم `README`
   مرة واحدة. تحقّق من الاسم عبر `ls` بعد الكتابة، وأصلح بـ`mv` إن لزم.

---

## 10. قواعد العمل في هذا المشروع

- **لا تكسر المخزون**: كل تعديل كمية عبر `services.py` فقط.
- **التعليقات بالعربية** وتشرح «لماذا» لا «ماذا».
- **الملفات تحت ~150 سطراً**، والدوال 20–40 سطراً.
- **لا إيموجي كعنصر واجهة وظيفي** — أيقونات Lucide فقط.
- **لا أسرار ولا نطاقات مكتوبة في الكود**.
- **بعد كل تغيير**: `manage.py test api` + `npm run lint` + `npm run build`.
- **قبل أي ادّعاء بنجاح**: شغّل الفحص واقرأ مخرجاته فعلياً — لا تفترض.

---

## 11. الملفات المرجعية في الجذر

| الملف | المحتوى |
|---|---|
| `REVIEW.md` | تقرير المراجعة الكامل: 5 مشاكل P0، 8 P1، 8 P2، 10 P3 — مع خطة مرحلية وجدول أولويات، والقسم 7 يسجّل ما نُفِّذ فعلاً وما لم يُنفَّذ |
| `README.md` | دليل التشغيل والنشر للمطوّر |
| `HANDOFF.md` | هذا الملف |
| `INTEGRATION-CHECKLIST.md` | موجود مسبقاً — لم أُراجعه في هذه النافذة |
