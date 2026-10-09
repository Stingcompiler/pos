# اسبير — نظام نقطة بيع قطع غيار السيارات

نظام متكامل لإدارة محل قطع غيار سيارات: نقطة بيع، مخزون، فواتير، موردون،
تقارير أرباح، ومتجر إلكتروني عام مرتبط بالمخزون نفسه.

الواجهة عربية بالكامل (RTL) ومهيّأة كتطبيق ويب مثبَّت (PWA).

مهيّأ للسوق السوداني: دفع نقدي/تحويل/مختلط/آجل مع منع تكرار رقم الإشعار،
حسابات العملاء وحدود الائتمان، المرتجعات، إقفال اليومية ومطابقة التحويلات،
التسعير بسعر الصرف، البحث بالأسماء الدارجة، استيراد Excel، الجرد بالباركود،
وتشغيل داخل المحل بلا إنترنت مع نسخ احتياطي مشفّر.

**دليل التشغيل لصاحب المحل:** [docs/OPERATIONS.md](docs/OPERATIONS.md).

**الهوية:** الشعار في `frontend/public/brand/` — `aspir-logo-light.svg` للخلفيات الفاتحة،
`aspir-logo-dark.svg` للداكنة، `aspir-mark.svg` الرمز وحده، و`aspir-logo.png` لرفعه
شعاراً من صفحة الإعدادات. الكلمة مرسومة من خط Tajawal (رخصة OFL، مرفقة).

---

## المكوّنات

| الطبقة | التقنية |
|--------|----------|
| الباك إند | Django + Django REST Framework |
| المصادقة | JWT داخل كوكيز HttpOnly مع تدوير توكنات وإبطال عند الخروج |
| قاعدة البيانات | SQLite للتطوير — PostgreSQL تلقائياً عند ضبط `DB_NAME` |
| الواجهة | React 19 + Vite + Tailwind CSS |
| الأيقونات | Lucide React (لا إيموجي في الواجهة) |
| خدمة الملفات الثابتة | WhiteNoise |

---

## التشغيل السريع

### المتطلبات

- Python 3.12 أو أحدث
- Node.js 20.19 أو أحدث (أو 22.12+)

### 1) الباك إند

```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate          # على Windows: .venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env               # ثم عدّل القيم (انظر «متغيّرات البيئة»)
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

يعمل الباك إند على `http://localhost:8000`.

> `SECRET_KEY` يُولَّد تلقائياً عند أول تشغيل ويُحفظ في `backend/.secret_key`
> (خارج git) إن لم يُضبط `DJANGO_SECRET_KEY`. لا يوجد أي مفتاح مكتوب في الكود.

### 2) الواجهة

```bash
cd frontend
npm install
cp .env.example .env               # القيمة الافتراضية VITE_API_URL=/api/
npm run dev
```

تفتح الواجهة على `http://localhost:5173`، ويمرّ `/api/` عبر بروكسي Vite
إلى `localhost:8000` أثناء التطوير — فلا حاجة لضبط CORS محلياً.

---

## الاختبارات والفحوص

```bash
# الباك إند (اختبارات التزامن تعمل فقط عند ضبط DB_NAME على PostgreSQL)
cd backend
python manage.py test api

# فحص إعدادات الإنتاج الأمنية (يعمل بمعنى حقيقي فقط مع DEBUG=False)
DJANGO_DEBUG=False python manage.py check --deploy

# الواجهة
cd frontend
npm run lint
npm test
npm run build
```

> **مهم**: `check --deploy` لا يكشف شيئاً مع `DEBUG=True` (لأن إعدادات
> الأمان الإنتاجية جميعها داخل `if not DEBUG:`). شغّله دائماً بـ
> `DJANGO_DEBUG=False` كما في الأمر أعلاه.

كل هذه الفحوص تعمل آلياً في CI على كل دفعة وطلب دمج
(`.github/workflows/ci.yml`).

---

## متغيّرات البيئة

### الباك إند (`backend/.env`)

| المتغيّر | الوصف |
|----------|-------|
| `DJANGO_DEBUG` | `False` افتراضياً (وضع إنتاج آمن). اضبطه `True` محلياً فقط |
| `DJANGO_SECRET_KEY` | اختياري — يُولَّد ويُحفظ في `.secret_key` إن تُرك فارغاً |
| `DJANGO_ALLOWED_HOSTS` | قائمة مضيفين مفصولة بفواصل |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | أصول موثوقة لطلب CSRF |
| `DJANGO_CORS_ALLOWED_ORIGINS` | أصول مسموح بها لطلبات CORS |
| `DB_NAME` … `DB_PORT` | اتركها فارغة لاستخدام SQLite |
| `EMAIL_*` | إعدادات SMTP لإشعارات الطلبات والرسائل |
| `ADMIN_NOTIFICATION_EMAIL` | بريد استلام الإشعارات — **بلا قيمة افتراضية** |
| `DJANGO_COOKIE_DOMAIN` | للنشر على دومينين منفصلين فقط (انظر أدناه) |
| `DJANGO_COOKIE_SAMESITE` | `Lax` افتراضياً وملائم لأصل واحد |
| `DJANGO_SECURE_SSL_REDIRECT` | `True` افتراضياً في الإنتاج |
| `DASHBOARD_BASE_URL` | رابط لوحة التحكم في رسائل الإشعارات — **بلا قيمة افتراضية** |
| `DJANGO_SERVE_MEDIA` | خدمة `/media/` عبر Django (`False` مع Nginx/CDN) |
| `DJANGO_BASE_CURRENCY` | عملة المؤسسة الوحيدة للفواتير والتقارير (`SDG` افتراضياً) |
| `DJANGO_PRICING_CURRENCIES` | عملات الشراء المسعّرة بسعر الصرف (`USD,AED,SAR,CNY,EGP`) |
| `DJANGO_LOCAL_NETWORK` | `True` لتشغيل النظام داخل المحل على الشبكة المحلية بلا HTTPS |
| `DJANGO_BACKUP_DIR` | مجلد النسخ الاحتياطية (يُفضَّل مجلد متزامن مع السحابة) |
| `DJANGO_BACKUP_KEEP` | عدد النسخ المحتفظ بها (14) |
| `DJANGO_BACKUP_KEY` | مفتاح تشفير النسخ (`backup_data --generate-key`) |

### الواجهة (`frontend/.env`)

| المتغيّر | الوصف |
|----------|-------|
| `VITE_API_URL` | عنوان الـ API. `/api/` افتراضياً ويعمل للتطوير والنشر على أصل واحد |

---

## النشر

### الوضع الافتراضي: أصل واحد (الأبسط والأكثر أماناً)

Django يخدم واجهة React المبنية **من نفس الأصل** (`core/urls.py` يوجّه كل
مسار ليس `/api/` أو `/admin/` أو `/media/` إلى `index.html`). لا حاجة لأي
إعداد cross-origin.

```bash
# 1) ابنِ الواجهة — المخرجات في frontend/dist
cd frontend && npm run build

# 2) اجمع الملفات الثابتة
cd ../backend && python manage.py collectstatic --noinput

# 3) شغّل خادم إنتاج (مثال gunicorn) مع DEBUG=False
DJANGO_DEBUG=False gunicorn core.wsgi:application --bind 0.0.0.0:8000
```

اضبط في هذه الحالة:
- `DJANGO_ALLOWED_HOSTS` و `DJANGO_CSRF_TRUSTED_ORIGINS` على الدومين الفعلي
- `ADMIN_NOTIFICATION_EMAIL` و `DASHBOARD_BASE_URL` (بدونهما تُرسل
  الإشعارات بلا بريد مستلم أو بلا رابط — مع تحذير في السجل)

### الوضع المتقدّم: دومينان منفصلان

عند وضع الواجهة على `app.example.com` والباك إند على `api.example.com`
يجب ضبط الثلاثة معاً **وإلا فشلت المصادقة بصمت**:

```bash
DJANGO_COOKIE_DOMAIN=.example.com
DJANGO_COOKIE_SAMESITE=None
DJANGO_COOKIE_SECURE=True
```

السبب: `Samesite=Lax` يمنع إرسال كوكي الجلسة في الطلبات cross-site، فتبدو
الواجهة وكأنها لا تسجّل الدخول رغم صحة بيانات الاعتماد.

### الوضع المحلي داخل المحل

`DJANGO_LOCAL_NETWORK=True` ثم `python manage.py serve_local` — التفاصيل في
[docs/OPERATIONS.md](docs/OPERATIONS.md).

> **عند الترقية:** الكتابة بكوكيز المصادقة تشترط الآن رمز CSRF، والواجهة
> الحالية ترسله تلقائياً. انشر الواجهة المبنية حديثاً مع الباك إند في الوقت
> نفسه؛ الواجهة القديمة لا ترسل الرمز فيُرفض دخولها (403).

---

## بنية المشروع

```
backend/
  core/                 إعدادات Django، التوجيهات، معالجات أخطاء 404/500
  api/
    models.py           النماذج — بلا أي تعديل مباشر للمخزون
    services.py         ← منطق المخزون والمال الحسّاس كله (ذرّي مع أقفال صفوف)
    serializers.py      التحويل والتحقق (وإخفاء التكلفة عن الموظف)
    views.py            نقاط النهاية الأساسية
    views_finance.py    المدفوعات، المصروفات، إقفال اليومية، التسعير، الجرد
    reports.py          حسابات التقارير الصافية من المرتجعات
    search.py           البحث العربي الموحّد
    importers.py        استيراد/تصدير Excel
    management/         backup_data، restore_data، serve_local، seed_vehicles
    permissions.py      صلاحيات الأدوار (RBAC)
    signals.py          الإشعارات الإدارية (تنبيه داخلي + بريد)
    validators.py       التحقق من الصور المرفوعة
    tests.py …          الاختبارات (test_market_features.py، test_concurrency.py)
  templates/errors/     صفحات 404 و500 العربية
frontend/
  src/
    context/            مصادقة وسلة (Context + Provider + Hook منفصلة)
    pages/              صفحات النظام والمتجر
    components/         مكوّنات مشتركة
    api/                إعداد axios وبناء روابط الصور
```

### مبدأ معماري يجب الحفاظ عليه

**لا يُعدَّل المخزون ولا المال إلا عبر `api/services.py`** داخل `transaction.atomic`
مع `select_for_update`. أي محاولة لخصم أو إضافة كمية في `views.py` أو
`serializers.py` أو `save()` تُعيد السباقات والخصم المزدوج الذي بُني هذا
التصميم لمنعه. الكمية في `SparePart.stock_quantity`، وكل تغيير عليها
يُسجَّل في `StockMovement` (سجل تدقيقي غير قابل للتعديل).

---

## الأدوار

| الدور | الصلاحيات |
|-------|-----------|
| **مدير** | كل شيء، بما فيه إدارة المستخدمين والحذف وإعادة فتح يوم مُقفل |
| **مشرف** | كل شيء ما عدا الحذف وإدارة المستخدمين؛ المرتجعات، الإقفال، المطابقة، الجرد، التسعير |
| **موظف** | البيع، إضافة العملاء وتحصيل ديونهم؛ يرى فواتيره فقط ولا يرى التكلفة أو الربح أو التقارير |

## نسخة العرض (Docker)

نسخة تسويقية حية: **https://aspir.stingdev.pro**. البيانات وهمية، وصفحة الدخول
تعرض حسابَي التجربة (مدير وكاشير)، وكل شيء يُعاد إلى حالته كل 3 ساعات. العمليات التي تعطّل التجربة على غيرك (الحذف، المستخدمون، هوية المحل، رفع الصور) معطّلة فيها.

```bash
cd deploy/vps
cp aspir.env.example .env          # اضبط DJANGO_SECRET_KEY والنطاق
docker compose up -d --build       # يستمع على 127.0.0.1:3300 خلف Caddy/Nginx
docker compose exec app python manage.py seed_demo --reset
```

- `Dockerfile` يبني الواجهة ثم يشغّل Django عبر Gunicorn، والبيانات في volume (`/data`).
- `seed_demo --reset` يمسح القاعدة كلها، ولا يعمل إلا مع `DJANGO_DEMO_MODE=True`.
- إعادة التعيين الليلية: `deploy/vps/aspir-demo-reset.{service,timer}` في systemd.
