"""
إعدادات Django لنظام إدارة قطع غيار السيارات ونقطة البيع.

لا يحتوي هذا الملف على أي أسرار حقيقية؛ تُقرأ جميع القيم الحساسة من
متغيّرات البيئة أو من ملف .env غير المتعقّب في git.
"""

from pathlib import Path
from datetime import timedelta
import os
import sys

from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent


# ─────────────────────────────────────────────────────────────────────────────
# محمّل .env بسيط (بدون اعتماد خارجي). القيم الموجودة في البيئة لها الأولوية.
# ─────────────────────────────────────────────────────────────────────────────
def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


_load_env_file(BASE_DIR / '.env')


def env_bool(name: str, default: bool = False) -> bool:
    """قراءة قيمة منطقية من متغيّرات البيئة."""
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name: str, default: str = '') -> list:
    """قراءة قائمة مفصولة بفواصل من متغيّرات البيئة."""
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(',') if item.strip()]


FRONTEND_DIR = BASE_DIR.parent / 'frontend' / 'dist'

# ─────────────────────────────────────────────────────────────────────────────
# الأمان الأساسي
# ─────────────────────────────────────────────────────────────────────────────
# الوضع الافتراضي هو الإنتاج (آمن). للتطوير المحلي اضبط DJANGO_DEBUG=True.
DEBUG = env_bool('DJANGO_DEBUG', False)

# وضع الشبكة المحلية: النظام يعمل على جهاز داخل المحل (لابتوب أو جهاز صغير)
# وتصل إليه أجهزة المحل عبر الواي فاي بعنوان مثل http://192.168.1.10:8000،
# فيستمر البيع عند انقطاع الإنترنت. لا HTTPS على الشبكة المحلية، فتُعطَّل
# الكوكيز الآمنة وإعادة التوجيه وHSTS. لا تستخدمه لخادم مكشوف على الإنترنت.
LOCAL_NETWORK_MODE = env_bool('DJANGO_LOCAL_NETWORK', False)


def _resolve_secret_key() -> str:
    """
    إرجاع SECRET_KEY من البيئة، أو من ملف محلي دائم يُولَّد عند أول تشغيل.

    لا نستخدم أي مفتاح مكتوب داخل الكود لأن المستودع عام. المفتاح المُولَّد
    فريد لكل تنصيب ومحفوظ في ملف خارج git.
    """
    from_env = os.environ.get('DJANGO_SECRET_KEY', '').strip()
    if from_env:
        return from_env

    key_file = BASE_DIR / '.secret_key'
    if key_file.exists():
        stored = key_file.read_text(encoding='utf-8').strip()
        if stored:
            return stored

    from django.core.management.utils import get_random_secret_key

    generated = get_random_secret_key()
    key_file.write_text(generated, encoding='utf-8')
    try:
        os.chmod(key_file, 0o600)
    except OSError:
        pass
    return generated


SECRET_KEY = _resolve_secret_key()

# المضيفون المسموحون — بدون '*' نهائياً.
DEFAULT_ALLOWED_HOSTS = (
    'localhost,127.0.0.1,0.0.0.0,'
    'n1.stingdev.pro,missingcars.pythonanywhere.com'
)
ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', DEFAULT_ALLOWED_HOSTS)
if LOCAL_NETWORK_MODE and 'DJANGO_ALLOWED_HOSTS' not in os.environ:
    # عنوان الجهاز على شبكة المحل يتغيّر مع الراوتر (DHCP).
    ALLOWED_HOSTS = ['*']

CSRF_TRUSTED_ORIGINS = env_list(
    'DJANGO_CSRF_TRUSTED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,'
    'https://n1.stingdev.pro,https://missingcars.pythonanywhere.com',
)

CORS_ALLOWED_ORIGINS = env_list(
    'DJANGO_CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,'
    'https://n1.stingdev.pro,https://missingcars.pythonanywhere.com',
)
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
# الواجهة ترسل Idempotency-Key مع فواتير البيع (منع الفاتورة المكررة عند
# إعادة المحاولة)؛ X-CSRFToken ضمن الترويسات الافتراضية أصلاً.
CORS_ALLOW_HEADERS = (*default_headers, 'idempotency-key')

# ─────────────────────────────────────────────────────────────────────────────
# Installed Apps
# ─────────────────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    # Local
    'api',
]

# ─────────────────────────────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [FRONTEND_DIR, BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# ─────────────────────────────────────────────────────────────────────────────
# Database — PostgreSQL عند توفر الإعدادات، وإلا SQLite للتطوير
# ─────────────────────────────────────────────────────────────────────────────
if os.environ.get('DB_NAME'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', 'localhost'),
            'PORT': os.environ.get('DB_PORT', '5432'),
            'CONN_MAX_AGE': 60,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# ─────────────────────────────────────────────────────────────────────────────
# Custom User Model
# ─────────────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'api.CustomUser'

# ─────────────────────────────────────────────────────────────────────────────
# Password Validators
# ─────────────────────────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─────────────────────────────────────────────────────────────────────────────
# Internationalization
# ─────────────────────────────────────────────────────────────────────────────
LANGUAGE_CODE = 'ar'
TIME_ZONE = os.environ.get('DJANGO_TIME_ZONE', 'Africa/Khartoum')
USE_I18N = True
USE_TZ = True

# عملة المؤسسة الوحيدة: الأسعار بلا عملة أو سعر صرف، فلا تُقبل فواتير بعملة
# أخرى ولا تُجمع في التقارير إلى أن يُدعم التحويل صراحةً.
BASE_CURRENCY = os.environ.get('DJANGO_BASE_CURRENCY', 'SDG').strip().upper()
# عملات الشراء التي تُسجَّل لها أسعار صرف ويُحسب منها سعر البيع بالجنيه.
PRICING_CURRENCIES = [
    code.upper() for code in env_list('DJANGO_PRICING_CURRENCIES', 'USD,AED,SAR,CNY,EGP')
    if code.upper() != BASE_CURRENCY
]

# ─────────────────────────────────────────────────────────────────────────────
# Static & Media Files
# ─────────────────────────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = []
if FRONTEND_DIR.exists():
    STATICFILES_DIRS.append(FRONTEND_DIR)
if (BASE_DIR / 'static').exists():
    STATICFILES_DIRS.append(BASE_DIR / 'static')

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        # في الإنتاج: ضغط الملفات وبصماتها عبر WhiteNoise.
        # في التطوير: التخزين الافتراضي حتى لا نضطر لتشغيل collectstatic.
        'BACKEND': (
            'django.contrib.staticfiles.storage.StaticFilesStorage'
            if DEBUG
            else 'whitenoise.storage.CompressedManifestStaticFilesStorage'
        ),
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# النسخ الاحتياطي (python manage.py backup_data)
# ─────────────────────────────────────────────────────────────────────────────
# اجعل المجلد خارج الجهاز فعلياً: مجلد متزامن مع Google Drive/Dropbox أو قرص
# خارجي. DJANGO_BACKUP_KEY (من backup_data --generate-key) يشفّر النسخ؛
# احفظه في مكان آمن منفصل، فلا استعادة بدونه.
BACKUP_DIR = os.environ.get('DJANGO_BACKUP_DIR') or str(BASE_DIR / 'backups')
BACKUP_KEEP = int(os.environ.get('DJANGO_BACKUP_KEEP', '14'))
BACKUP_ENCRYPTION_KEY = os.environ.get('DJANGO_BACKUP_KEY', '')

# عامل خدمة الواجهة (PWA) في /static/sw.js ونطاقه الجذر كله.
WHITENOISE_ADD_HEADERS_FUNCTION = 'core.static_headers.add_headers'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
# ملفات خاصة (صور إشعارات التحويل) خارج MEDIA_ROOT: لا تُخدم عبر /media/.
PRIVATE_MEDIA_ROOT = Path(os.environ.get('DJANGO_PRIVATE_MEDIA_ROOT') or BASE_DIR / 'private_media')

# خدمة ملفات الميديا عبر Django (مناسب للتنصيب الحالي). في الإنتاج المثالي
# تُخدم الميديا عبر Nginx أو CDN — اضبط DJANGO_SERVE_MEDIA=False حينها.
SERVE_MEDIA = env_bool('DJANGO_SERVE_MEDIA', True)

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─────────────────────────────────────────────────────────────────────────────
# Django REST Framework
# ─────────────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'api.authentication.CookieJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'api.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '120/min',
        'user': '3000/hour',
        'login': '10/min',
        'public_write': '30/hour',
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# SimpleJWT — الكوكيز HttpOnly + تدوير التوكنات مع منع إعادة الاستخدام
# ─────────────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ─────────────────────────────────────────────────────────────────────────────
# Cookie Settings
# ─────────────────────────────────────────────────────────────────────────────
AUTH_COOKIE = 'access_token'
AUTH_COOKIE_REFRESH = 'refresh_token'
AUTH_COOKIE_HTTP_ONLY = True
AUTH_COOKIE_SAMESITE = os.environ.get('DJANGO_COOKIE_SAMESITE', 'Lax')
# الكوكي تخصّ الدومين الحالي افتراضياً. للنشر على دومينين منفصلين
# (api.example.com + app.example.com) اضبط DJANGO_COOKIE_DOMAIN='.example.com'
# مع DJANGO_COOKIE_SAMESITE=None و DJANGO_COOKIE_SECURE=True، وإلا فشلت
# المصادقة كاملةً لأن Samesite=Lax يمنع إرسال الكوكي عبر الأصول المختلفة.
AUTH_COOKIE_DOMAIN = os.environ.get('DJANGO_COOKIE_DOMAIN') or None
AUTH_COOKIE_SECURE = env_bool('DJANGO_COOKIE_SECURE', not DEBUG and not LOCAL_NETWORK_MODE)
AUTH_COOKIE_PATH = '/'
# عمر كوكي رمز الوصول يطابق عمر الرمز نفسه (30 دقيقة) لا 7 أيام — الكوكي
# الأطول عمراً من محتواها تُلخبط التشخيص فقط وتُظهر «كوكي صالحة» منتهية.
AUTH_COOKIE_ACCESS_MAX_AGE = int(
    os.environ.get('DJANGO_ACCESS_COOKIE_MAX_AGE', str(60 * 30))
)
# عمر كوكي رمز التحديث (7 أيام) ليصمد عبر جلسات المتصفح.
AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

# كتابة الـ API بكوكيز المصادقة تشترط رمز CSRF (api.authentication). الواجهة
# تقرأ كوكي csrftoken وترسله في X-CSRFToken، لذا يتبع دومينها دومين كوكيز
# المصادقة: عند فصل الواجهة على دومين فرعي تصبح الكوكي مقروءة منها أيضاً.
CSRF_COOKIE_DOMAIN = AUTH_COOKIE_DOMAIN

# ─────────────────────────────────────────────────────────────────────────────
# إعدادات أمان إضافية تُفعَّل في الإنتاج فقط
# ─────────────────────────────────────────────────────────────────────────────
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'same-origin'

if not DEBUG:
    # افتراضيه True: تشغيل بلا HTTPS في الإنتاج يعني إرسال كوكي الجلسة عبر
    # اتصال غير مشفّر. عطّله فقط إن كان الوكيل الأمامي يتولّى الإعادة.
    SECURE_SSL_REDIRECT = env_bool('DJANGO_SECURE_SSL_REDIRECT', not LOCAL_NETWORK_MODE)
    SESSION_COOKIE_SECURE = not LOCAL_NETWORK_MODE
    CSRF_COOKIE_SECURE = not LOCAL_NETWORK_MODE
    SECURE_HSTS_SECONDS = 0 if LOCAL_NETWORK_MODE else int(
        os.environ.get('DJANGO_HSTS_SECONDS', '31536000')
    )
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# ─────────────────────────────────────────────────────────────────────────────
# Logging — تسجيل الأخطاء المهمة إلى الطرفية
# ─────────────────────────────────────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django.request': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'api': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# Email Configuration
# ─────────────────────────────────────────────────────────────────────────────
EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend'
)
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USE_TLS = env_bool('EMAIL_USE_TLS', True)
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER)

# بريد استلام إشعارات لوحة الإدارة. لا قيمة افتراضية مكتوبة في الكود:
# المستودع عام، وبريد افتراضي غير مراقَب يجعل النظام يبدو عاملاً بينما
# لا أحد يستلم الإشعارات. signals.py يسجّل تحذيراً عندما تكون فارغة.
ADMIN_NOTIFICATION_EMAIL = os.environ.get('ADMIN_NOTIFICATION_EMAIL', '')

# رابط لوحة التحكم المستخدم في روابط رسائل البريد الإدارية. القيمة الافتراضية
# فارغة عمداً: إرسال رابط localhost في الإنتاج يُنتج زرّاً معطوباً يوهم الأدمن
# بأن النظام انكسر. signals.py يتخطّى إضافة الرابط إن كانت فارغة.
DASHBOARD_BASE_URL = os.environ.get('DASHBOARD_BASE_URL', '').rstrip('/')

# ─────────────────────────────────────────────────────────────────────────────
# تسريع الاختبارات: تجزئة مبسّطة لكلمات المرور أثناء تشغيل الاختبارات فقط.
# يقلّل زمن المجموعة كثيراً دون أي تأثير على الإنتاج.
# ─────────────────────────────────────────────────────────────────────────────
if 'test' in sys.argv:
    PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
