"""
تشغيل النظام على جهاز داخل المحل لكل أجهزة الشبكة المحلية.

    python manage.py serve_local [--port 8000] [--backup-hours 24]

- يخدم الواجهة والـ API عبر waitress (يعمل على ويندوز ولينكس وماك).
- يطبع عناوين الجهاز على الشبكة لفتحها من الهواتف والأجهزة الأخرى.
- ينشئ نسخة احتياطية عند البدء ثم كل --backup-hours ساعة (0 = بلا نسخ)، ويحذف
  قبلها رموز الدخول المنتهية.

يتطلب: DJANGO_LOCAL_NETWORK=True و DJANGO_DEBUG=False، وبناء الواجهة
(npm run build) ثم python manage.py collectstatic.
"""

import socket
import threading

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


def lan_addresses() -> list:
    """عناوين IPv4 للجهاز على الشبكة المحلية (بلا اتصال فعلي بالإنترنت)."""
    addresses = set()
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(('10.255.255.255', 1))
        addresses.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass
    return sorted(address for address in addresses if not address.startswith('127.'))


class Command(BaseCommand):
    help = 'تشغيل النظام لأجهزة شبكة المحل مع نسخ احتياطي دوري.'

    def add_arguments(self, parser):
        parser.add_argument('--host', default='0.0.0.0')
        parser.add_argument('--port', type=int, default=8000)
        parser.add_argument('--threads', type=int, default=8)
        parser.add_argument('--backup-hours', type=float, default=24)

    def handle(self, *args, **options):
        if settings.DEBUG:
            raise CommandError('شغّل الوضع المحلي بـ DJANGO_DEBUG=False.')
        if not settings.LOCAL_NETWORK_MODE:
            raise CommandError('اضبط DJANGO_LOCAL_NETWORK=True لتشغيل النظام على شبكة المحل.')
        try:
            from waitress import serve
        except ImportError as exc:
            raise CommandError('ثبّت waitress: pip install -r requirements.txt') from exc

        from core.wsgi import application

        if options['backup_hours'] > 0:
            self._schedule_backups(options['backup_hours'] * 3600)

        port = options['port']
        self.stdout.write(self.style.SUCCESS('النظام يعمل. افتح من أجهزة المحل:'))
        for address in lan_addresses() or ['<عنوان-الجهاز>']:
            self.stdout.write(f'  http://{address}:{port}')
        self.stdout.write(f'  http://localhost:{port}  (من هذا الجهاز)')
        serve(application, host=options['host'], port=port, threads=options['threads'])

    def _schedule_backups(self, interval_seconds: float) -> None:
        def run():
            try:
                # الرموز المنتهية لا حاجة لها؛ حذفها يُبقي جدول الجلسات والنسخة صغيرين.
                call_command('flushexpiredtokens')
                call_command('backup_data')
            except Exception as exc:  # النسخ لا يوقف البيع؛ يُطبع الفشل ويُعاد لاحقاً.
                self.stderr.write(self.style.ERROR(f'فشل النسخ الاحتياطي: {exc}'))
            timer = threading.Timer(interval_seconds, run)
            timer.daemon = True
            timer.start()

        run()
