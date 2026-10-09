"""
معالجات أخطاء موحّدة بالعربية لصفحات 404 و500.

بدونها يرى الزائر — والأدمن — صفحة Django الافتراضية بالإنجليزية، بخطّ
مختلف تماماً عن الواجهة وبلا طريق للعودة. الأسوأ أن صفحة 500 الافتراضية
لا تعطي المستخدم أي مخرج، فيبدو الموقع منقطعاً لا خاطئاً.

ملاحظة: `handler404` لا يُفعَّل إلا مع `DEBUG=False`، لذا لا يمكن اختباره
محلياً في وضع التطوير.
"""

import re

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.utils.html import escape


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


SHARE_TITLE = 'اسبير — نظام نقطة بيع ومخزون لمحلات قطع الغيار'
SHARE_DESCRIPTION = (
    'بيع وتابع ديون الورش واعرف مخزونك حتى بدون إنترنت: تحويلات بنكك بلا تكرار، '
    'بحث بالأسماء الدارجة، وإقفال يومي للدرج. جرّب النسخة التجريبية مجاناً.'
)


def spa_index(request):
    """
    صفحة الواجهة (React) لكل المسارات غير الـ API.

    في نسخة العرض تُضاف إلى الصفحة الرئيسية وسوم المشاركة (Open Graph): واتساب
    وفيسبوك لا يشغّلان JavaScript، فيقرآن العنوان والصورة من HTML الخادم.
    متجر المحل الحقيقي لا يحصل عليها، فلا يُشارك رابطه باسم اسبير.
    """
    response = render(request, 'index.html')
    if getattr(settings, 'DEMO_MODE', False) and request.path == '/':
        url = request.build_absolute_uri('/')
        image = request.build_absolute_uri(f'{settings.STATIC_URL}landing/og.jpg')
        tags = ''.join(
            f'<meta {attr}="{name}" content="{escape(value)}">'
            for attr, name, value in (
                ('property', 'og:type', 'website'),
                ('property', 'og:site_name', 'اسبير'),
                ('property', 'og:locale', 'ar_SD'),
                ('property', 'og:title', SHARE_TITLE),
                ('property', 'og:description', SHARE_DESCRIPTION),
                ('property', 'og:url', url),
                ('property', 'og:image', image),
                ('property', 'og:image:width', '1200'),
                ('property', 'og:image:height', '630'),
                ('name', 'twitter:card', 'summary_large_image'),
                ('name', 'twitter:title', SHARE_TITLE),
                ('name', 'twitter:description', SHARE_DESCRIPTION),
                ('name', 'twitter:image', image),
            )
        ) + f'<link rel="canonical" href="{escape(url)}"><title>{escape(SHARE_TITLE)}</title>'
        html = response.content.decode('utf-8')
        html = re.sub(r'<title>.*?</title>', '', html, count=1, flags=re.S)
        response.content = html.replace('</head>', f'{tags}</head>', 1).encode('utf-8')
    return response
