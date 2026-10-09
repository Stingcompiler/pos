"""
تخزين خاص لملفات لا تُخدم عبر /media/ العامة.

صور إشعارات التحويل تحمل أرقام حسابات العملاء وأسماءهم؛ ملفات /media/ تُخدم
لأي أحد يعرف الرابط (وأسماء لقطات الهاتف توقيتات يسهل تخمينها). هذه الملفات
تُحفظ خارج MEDIA_ROOT ولا تُقرأ إلا عبر نقطة نهاية تتحقق من الصلاحية.
"""

import os

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateMediaStorage(FileSystemStorage):
    """المسار يُقرأ من الإعدادات عند كل استخدام (لا عند تحميل النماذج)."""

    @property
    def base_location(self):
        return str(settings.PRIVATE_MEDIA_ROOT)

    @property
    def location(self):
        return os.path.abspath(self.base_location)


def private_storage():
    return PrivateMediaStorage()
