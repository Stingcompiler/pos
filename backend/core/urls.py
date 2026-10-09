"""
Core URL configuration.
"""

from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve
from django.conf import settings
from django.conf.urls.static import static

from core.views import spa_index

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    
    # Catch-all route for the React frontend
    
    re_path(r'^(?!api/|admin/|media/|static/).*$', spa_index, name='index'),
]

# ─────────────────────────────────────────────────────────────────────────────
# معالجات أخطاء موحّدة: صفحات عربية بنفس هوية الواجهة بدل صفحات Django
# الافتراضية الإنجليزية. مسارات الـ API تحصل على JSON بدل HTML.
# ملاحظة: handler404 لا يُفعَّل إلا مع DEBUG=False — يجب اختباره إنتاجياً.
# ─────────────────────────────────────────────────────────────────────────────
handler404 = 'core.views.custom_404'
handler500 = 'core.views.custom_500'

# خدمة ملفات الميديا:
# - في التطوير: عبر أداة static المساعدة.
# - في الإنتاج: djangosetting SERVE_MEDIA يتحكم بالخدمة عبر Django. كانت
#   الخدمة مشروطة بـ DEBUG فقط، فكان الإعداد ميتاً وتُرجَع صور المنتجات 404
#   على خادم الإنتاج (أهم عرَض: صور القطع لا تظهر للمستخدمين).
# - في الإنتاج المثالي: اجعل DJANGO_SERVE_MEDIA=False واخدم /media/ عبر Nginx.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif getattr(settings, 'SERVE_MEDIA', False):
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]
