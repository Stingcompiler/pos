"""
أدوات تقسيم الصفحات (Pagination) لواجهة الـ API.
"""

from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """
    تقسيم صفحات قياسي يدعم تمرير `page_size` من الواجهة.

    كانت الواجهة الأمامية ترسل `?page_size=100` دون أن يدعمه الخادم،
    فيُقصّ الطلب عند القيمة الافتراضية. هذا الصنف يُفعّل الدعم مع حدٍّ
    أعلى آمن يمنع طلب آلاف السجلات في نداء واحد.
    """

    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class LargeResultsSetPagination(StandardResultsSetPagination):
    """تقسيم صفحات بحجم أكبر — للجداول المرجعية الصغيرة (فئات، موديلات سيارات)."""

    page_size = 200
    max_page_size = 500
