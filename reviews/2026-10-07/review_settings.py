"""Isolated review configuration. Never uses the merchant's database or SMTP."""
import os

os.environ['DB_NAME'] = ''
os.environ['DJANGO_SECRET_KEY'] = 'review-only-key-for-isolated-tests-not-a-production-secret-20261007'
os.environ['EMAIL_BACKEND'] = 'django.core.mail.backends.locmem.EmailBackend'
os.environ['ADMIN_NOTIFICATION_EMAIL'] = ''
os.environ['DASHBOARD_BASE_URL'] = ''
os.environ['DJANGO_DEBUG'] = 'True'
os.environ['DJANGO_COOKIE_SECURE'] = 'False'

from core.settings import *  # noqa: F403,E402

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': '/private/tmp/pos-review-20261007.sqlite3'}}
ALLOWED_HOSTS = ['testserver', 'localhost', '127.0.0.1']
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
MEDIA_ROOT = '/private/tmp/pos-review-20261007-media'
FRONTEND_DIR = __import__('pathlib').Path('/private/tmp/pos-review-20261007-dist')
TEMPLATES[0]['DIRS'] = [FRONTEND_DIR, BASE_DIR / 'templates']  # noqa: F405
STATICFILES_DIRS = [FRONTEND_DIR]
STATIC_ROOT = '/private/tmp/pos-review-20261007-static'
REST_FRAMEWORK = {**REST_FRAMEWORK, 'DEFAULT_THROTTLE_CLASSES': []}  # noqa: F405

