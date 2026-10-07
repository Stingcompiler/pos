"""
إشارات Django (Signals) الخاصة بالإشعارات الإدارية.

تُحمَّل عبر ApiConfig.ready() وليس عبر models.py مباشرة، لفصل منطق
الإشعارات عن طبقة النماذج.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import CarModel, Category, ContactMessage, Notification, PublicOrder, SparePart
from .search import refresh_search_text

logger = logging.getLogger('api')


def _dashboard_url(path: str = '/dashboard/orders') -> str:
    """
    بناء رابط لوحة التحكم من إعدادات البيئة، أو سلسلة فارغة إن لم تُضبط.

    لا نُعيد قيمة افتراضية localhost: إرسال رابط محلي في الإنتاج يُنتج زرّاً
    معطوباً يوهم الأدمن بأن النظام انكسر. سلسلة فارغة تعني «تخطَّ الرابط».
    """
    base = getattr(settings, 'DASHBOARD_BASE_URL', '') or ''
    if not base:
        return ''
    return f"{base.rstrip('/')}{path}"


def _send_admin_email(subject: str, body: str) -> None:
    """إرسال بريد للإدارة دون كسر أي تدفق عند فشل الإرسال."""
    recipient = getattr(settings, 'ADMIN_NOTIFICATION_EMAIL', None)
    if not recipient:
        logger.warning('ADMIN_NOTIFICATION_EMAIL غير مضبوط — تم تخطي إرسال البريد.')
        return
    try:
        # fail_silently=False حتى يظهر فشل SMTP في السجلات بدل تجاهله،
        # ثم نلتقطه هنا ونسجّله دون كسر تدفق الطلب.
        send_mail(
            subject=subject,
            message=body,
            from_email=None,
            recipient_list=[recipient],
            fail_silently=False,
        )
    except Exception:
        logger.exception('فشل إرسال بريد الإشعار الإداري')


@receiver(post_save, sender=PublicOrder)
def notify_admin_new_order(sender, instance, created, raw=False, **kwargs):
    """إنشاء تنبيه داخلي + بريد عند وصول طلب شراء جديد من الموقع."""
    # raw: تحميل بيانات (استعادة نسخة احتياطية) لا طلب جديد فعلاً.
    if not created or raw:
        return

    try:
        Notification.objects.create(
            message=(
                f"طلب شراء جديد من العميل {instance.customer_name} "
                f"بقيمة {instance.total_amount} ج.س"
            ),
            notification_type=Notification.NotificationType.ORDER,
        )
    except Exception:
        logger.exception('فشل إنشاء تنبيه الطلب الجديد')

    def send_order_email():
        try:
            items = instance.items.select_related('spare_part').all()
            items_str = "\n".join(
                f"- {item.spare_part.name} "
                f"(الكمية: {item.quantity}, السعر: {item.unit_price} ج.س)"
                for item in items
            )
            subject = f"طلب جديد من الموقع الالكتروني: #{instance.id}"
            body = (
                "مرحباً أدمن،\n\n"
                "تم استلام طلب شراء جديد من الموقع الإلكتروني بانتظار التأكيد.\n\n"
                "تفاصيل العميل:\n"
                f"- اسم الزبون: {instance.customer_name}\n"
                f"- رقم الهاتف: {instance.phone_number}\n"
                f"- البريد الإلكتروني: {instance.email or 'غير متوفر'}\n"
                f"- العنوان / المنطقة: {instance.location or 'غير متوفر'}\n\n"
                f"المنتجات المطلوبة:\n{items_str}\n\n"
                f"إجمالي القيمة: {instance.total_amount} ج.س\n"
            )
            dashboard_link = _dashboard_url('/dashboard/orders')
            if dashboard_link:
                body += (
                    "\nيمكنك مراجعة وتأكيد الطلب مباشرة عبر لوحة التحكم:\n"
                    f"{dashboard_link}"
                )
            else:
                logger.warning(
                    'DASHBOARD_BASE_URL غير مضبوط — أُرسل إشعار الطلب بلا رابط.'
                )
                body += (
                    "\n(رابط لوحة التحكم غير مضبوط: اضبط DASHBOARD_BASE_URL "
                    "في بيئة الإنتاج لإرفاق رابط مباشر بالرسائل.)"
                )
            _send_admin_email(subject, body)
        except Exception:
            logger.exception('فشل تجهيز بريد الطلب الجديد')

    # تأجيل الإرسال حتى نجاح المعاملة الحالية بالكامل.
    transaction.on_commit(send_order_email)


@receiver(post_save, sender=ContactMessage)
def notify_admin_new_contact_message(sender, instance, created, raw=False, **kwargs):
    """إنشاء تنبيه داخلي + بريد عند وصول رسالة تواصل جديدة."""
    if not created or raw:
        return

    try:
        Notification.objects.create(
            message=f"رسالة تواصل جديدة من {instance.name}",
            notification_type=Notification.NotificationType.MESSAGE,
        )
    except Exception:
        logger.exception('فشل إنشاء تنبيه رسالة التواصل')

    def send_message_email():
        try:
            subject = f"رسالة تواصل جديدة من الموقع: {instance.name}"
            body = (
                "مرحباً أدمن،\n\n"
                "تم استلام رسالة تواصل جديدة من الموقع الإلكتروني.\n\n"
                "تفاصيل المرسل:\n"
                f"- الاسم الكريم: {instance.name}\n"
                f"- البريد الإلكتروني: {instance.email}\n"
                f"- رقم الهاتف: {instance.phone or 'غير متوفر'}\n\n"
                f"الرسالة:\n{instance.message}\n\n"
                f"تاريخ الإرسال: {instance.created_at}\n"
            )
            dashboard_link = _dashboard_url('/dashboard/messages')
            if dashboard_link:
                body += (
                    "\nيمكنك مراجعة الرسالة والرد عليها من لوحة التحكم:\n"
                    f"{dashboard_link}"
                )
            else:
                logger.warning(
                    'DASHBOARD_BASE_URL غير مضبوط — أُرسلت الرسالة بلا رابط.'
                )
            _send_admin_email(subject, body)
        except Exception:
            logger.exception('فشل تجهيز بريد رسالة التواصل')

    transaction.on_commit(send_message_email)


# ─── تحديث نص البحث عند تغيّر علاقات القطعة ─────────────────────────────

@receiver(m2m_changed, sender=SparePart.compatible_cars.through)
def refresh_part_search_on_cars_change(sender, instance, action, reverse, pk_set, **kwargs):
    """السيارات المتوافقة جزء من نص البحث («فلتر هايلوكس»)."""
    if action not in ('post_add', 'post_remove', 'post_clear'):
        return
    if reverse:
        # تعديل من جهة الموديل: القطع المتأثرة هي pk_set (أو كل قطعه عند المسح).
        parts = SparePart.objects.filter(pk__in=pk_set) if pk_set else instance.spare_parts.all()
    else:
        parts = [instance]
    refresh_search_text(parts)


@receiver(post_save, sender=Category)
def refresh_part_search_on_category_rename(sender, instance, created, raw=False, **kwargs):
    if not created and not raw:
        refresh_search_text(instance.spare_parts.select_related('category'))


@receiver(post_save, sender=CarModel)
def refresh_part_search_on_car_rename(sender, instance, created, raw=False, **kwargs):
    if not created and not raw:
        refresh_search_text(instance.spare_parts.select_related('category'))
