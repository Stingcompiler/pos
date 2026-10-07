"""
معالجات أخطاء موحّدة بالعربية لصفحات 404 و500.

بدونها يرى الزائر — والأدمن — صفحة Django الافتراضية بالإنجليزية، بخطّ
مختلف تماماً عن الواجهة وبلا طريق للعودة. الأسوأ أن صفحة 500 الافتراضية
لا تعطي المستخدم أي مخرج، فيبدو الموقع منقطعاً لا خاطئاً.

ملاحظة: `handler404` لا يُفعَّل إلا مع `DEBUG=False`، لذا لا يمكن اختباره
محلياً في وضع التطوير.
"""

from django.http import JsonResponse
from django.shortcuts import render


def _expects_json(request) -> bool:
    """
    هل الطلب موجَّه لمسار API؟

    طلبات الـ API تنتظر `{detail: ...}`، وردّها بصفحة HTML يُصعّب تشخيص
    الواجهة. لذا نميّز المسار قبل اختيار شكل الردّ.
    """
    return request.path.startswith('/api/')


def custom_404(request, exception=None):
    """صفحة «غير موجود» عربية، أو رسالة JSON لمسارات الـ API."""
    if _expects_json(request):
        return JsonResponse({'detail': 'المسار المطلوب غير موجود.'}, status=404)
    return render(request, 'errors/404.html', status=404)


def custom_500(request):
    """صفحة خطأ الخادم العربية، أو رسالة JSON لمسارات الـ API."""
    if _expects_json(request):
        return JsonResponse({'detail': 'حدث خطأ غير متوقع في الخادم.'}, status=500)
    return render(request, 'errors/500.html', status=500)
