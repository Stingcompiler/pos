"""
Custom JWT authentication that reads tokens from HttpOnly cookies.
"""

from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


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
        except (InvalidToken, TokenError):
            return None

        return self.get_user(validated_token), validated_token
