"""
Custom JWT authentication that reads tokens from HttpOnly cookies.
"""

from django.conf import settings
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


def enforce_csrf(request):
    """
    فرض التحقق من CSRF على الطلبات غير الآمنة (POST/PUT/PATCH/DELETE).

    المتصفح يرسل كوكي المصادقة تلقائياً مع أي طلب، حتى لو صدر من موقع آخر؛
    لذلك لا تكفي الكوكي وحدها لإثبات أن الطلب صادر من واجهة النظام. DRF يعفي
    واجهاته من وسيط CSRF ويترك التحقق لفئة المصادقة، كما تفعل
    SessionAuthentication — وهذا ما نكرّره هنا. يرفض الطلب إن غاب رمز
    X-CSRFToken أو لم يطابق كوكي csrftoken، أو كان الأصل (Origin) غير موثوق.
    """
    def dummy_get_response(request):
        return None

    check = CSRFCheck(dummy_get_response)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f'CSRF Failed: {reason}')


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom authentication class that extracts the JWT access token
    from an HttpOnly cookie instead of the Authorization header.
    """

    def authenticate(self, request):
        # Try to get the access token from cookies
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE)

        if raw_token is None:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
        except (InvalidToken, TokenError, exceptions.AuthenticationFailed):
            # كوكي لمستخدم حُذف أو عُطّل (أو قاعدة أُعيدت من نسخة) = زائر مجهول، لا 401
            # على كل طلب حتى للصفحات العامة. الواجهات المحمية ترفضه بصلاحياتها.
            return None

        enforce_csrf(request)
        return user, validated_token
