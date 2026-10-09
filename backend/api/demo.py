"""
حماية نسخة العرض العامة (DJANGO_DEMO_MODE).

كل الزوار يدخلون بحسابات التجربة نفسها وعلى البيانات نفسها. زائر واحد كان
يستطيع تغيير كلمة مرور demo أو حذف المستخدمين أو تغيير اسم المحل وشعاره أو
رفع صور تظهر لكل من بعده، حتى إعادة التعيين التالية. هنا تُمنع العمليات التي
تعطّل التجربة على غيره، ويبقى ما يعرض قيمة النظام مفتوحاً: البيع والعملاء
والجرد والتوريد والإقفال واستيراد Excel.

لا أثر لهذه الوحدة خارج وضع العرض.
"""

import json
import re

from django.conf import settings
from django.db.models.signals import pre_save
from django.http import HttpResponse
from rest_framework.exceptions import PermissionDenied

DEMO_BLOCKED_MESSAGE = 'هذه العملية معطّلة في النسخة التجريبية حتى لا تتأثر تجربة غيرك. ستعمل في نسختك.'

SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS'}
# مسارات تُمنع كل كتاباتها: الحسابات، هوية المحل وشعاره، ووسائل التواصل العامة.
BLOCKED_WRITE_PATHS = re.compile(r'^/api/(users|admin/settings|contact-methods)(/|$)')


class DemoGuardMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (
            getattr(settings, 'DEMO_MODE', False)
            and request.method not in SAFE_METHODS
            and request.path.startswith('/api/')
            and (request.method == 'DELETE' or BLOCKED_WRITE_PATHS.match(request.path))
        ):
            return HttpResponse(
                json.dumps({'detail': DEMO_BLOCKED_MESSAGE}, ensure_ascii=False),
                status=403, content_type='application/json',
            )
        return self.get_response(request)


def block_image_uploads(sender, instance, **kwargs):
    """
    صورة جديدة مرفوعة (قطعة، فئة، موديل، شعار، إشعار تحويل) تُرفض في وضع العرض.

    عند الحفظ لا في الوسيط: التعديل يرسل الصورة أحياناً بـ PATCH متعدد الأجزاء،
    وقراءة جسم الطلب في الوسيط تُفسده على DRF. PermissionDenied داخل الواجهة
    يصبح 403 برسالة واضحة.
    """
    if not getattr(settings, 'DEMO_MODE', False):
        return
    for field in instance._meta.get_fields():
        if field.get_internal_type() not in ('ImageField', 'FileField'):
            continue
        value = getattr(instance, field.attname, None)
        if value and not getattr(value, '_committed', True):
            raise PermissionDenied(DEMO_BLOCKED_MESSAGE)


pre_save.connect(block_image_uploads, dispatch_uid='demo-block-image-uploads')
