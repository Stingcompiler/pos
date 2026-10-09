"""
نسخة احتياطية كاملة: البيانات + الصور المرفوعة + بيان تحقق.

    python manage.py backup_data [--output-dir DIR] [--keep 14]

يُنتج ملفاً واحداً backup-YYYYMMDD-HHMMSS.zip يحتوي:
- data.json: كل بيانات النظام (dumpdata)، مستقلة عن نوع قاعدة البيانات، فتصلح
  أيضاً للانتقال من SQLite إلى PostgreSQL.
- media/: صور القطع والفئات والشعار.
- private/: صور إشعارات التحويل (خارج /media/ العامة).
- manifest.json: وقت النسخ وآخر ترحيل وعدد سجلات كل جدول وبصمة SHA-256.

عند ضبط DJANGO_BACKUP_KEY يُشفَّر الملف (Fernet) ويصبح امتداده .zip.enc.
وجهة النسخ يُفضَّل أن تكون خارج الجهاز: مجلد متزامن مع Google Drive أو
Dropbox، أو قرص خارجي. الأقدم من آخر --keep نسخة يُحذف تلقائياً.
"""

import hashlib
import io
import json
import zipfile
from contextlib import contextmanager
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import DEFAULT_DB_ALIAS, connections, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

# جداول تُعاد بنيتها تلقائياً بعد الترحيل، أو مؤقتة لا قيمة لاستعادتها.
# token_blacklist يُنسخ: بدونه تعود جلسات خرج أصحابها (أو استُبدلت رموزها)
# صالحةً بعد الاستعادة حتى تنتهي مدتها.
EXCLUDED = [
    'contenttypes', 'auth.permission', 'sessions', 'admin.logentry',
]
BACKUP_PREFIX = 'backup-'


def get_fernet():
    """مشفّر Fernet من DJANGO_BACKUP_KEY، أو None إن لم يُضبط."""
    key = getattr(settings, 'BACKUP_ENCRYPTION_KEY', '')
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
    except ImportError as exc:
        raise CommandError('DJANGO_BACKUP_KEY مضبوط لكن مكتبة cryptography غير مثبتة.') from exc
    try:
        return Fernet(key.encode())
    except ValueError as exc:
        raise CommandError(
            'DJANGO_BACKUP_KEY غير صالح. ولّد مفتاحاً بالأمر: python manage.py backup_data --generate-key'
        ) from exc


@contextmanager
def consistent_snapshot():
    """
    كل قراءات النسخة من لقطة واحدة للقاعدة.

    dumpdata يقرأ الجداول واحداً بعد الآخر؛ بيع يُسجَّل بينها كان يُنتج نسخة
    فيها بنود فاتورة بلا فاتورتها (فتفشل الاستعادة) وأعداداً في البيان لا
    تطابق البيانات. اللقطة لا تحجز الكتابة، فيستمر البيع أثناء النسخ.
    """
    connection = connections[DEFAULT_DB_ALIAS]
    if connection.in_atomic_block:
        # داخل معاملة قائمة (الاختبارات): لقطتها هي ما يُقرأ.
        yield
        return

    if connection.vendor == 'postgresql':
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            yield
    elif connection.vendor == 'sqlite':
        # BEGIN عادي لا IMMEDIATE (إعداد القاعدة): معاملة قراءة في وضع WAL
        # تثبّت لقطتها من أول قراءة دون أن تمنع الكاشير من الكتابة.
        connection.ensure_connection()
        mode = connection.transaction_mode
        connection.transaction_mode = None
        try:
            with transaction.atomic():
                connection.transaction_mode = mode
                yield
        finally:
            connection.transaction_mode = mode
    else:
        with transaction.atomic():
            yield


def model_counts() -> dict:
    """عدد سجلات كل جدول من جداول النظام (للمقارنة بعد الاستعادة)."""
    return {
        model._meta.label: model.objects.count()
        for model in apps.get_app_config('api').get_models()
        if not model._meta.proxy
    }


class Command(BaseCommand):
    help = 'إنشاء نسخة احتياطية كاملة (بيانات + صور) في ملف واحد.'

    def add_arguments(self, parser):
        parser.add_argument('--output-dir', default=None, help='مجلد النسخ (الافتراضي DJANGO_BACKUP_DIR).')
        parser.add_argument('--keep', type=int, default=None, help='عدد النسخ المحتفظ بها (الافتراضي 14).')
        parser.add_argument('--generate-key', action='store_true', help='طباعة مفتاح تشفير جديد والخروج.')

    def handle(self, *args, **options):
        if options['generate_key']:
            from cryptography.fernet import Fernet
            self.stdout.write(Fernet.generate_key().decode())
            return

        output_dir = Path(options['output_dir'] or settings.BACKUP_DIR)
        output_dir.mkdir(parents=True, exist_ok=True)
        keep = options['keep'] if options['keep'] is not None else settings.BACKUP_KEEP
        fernet = get_fernet()

        data = io.StringIO()
        with consistent_snapshot():
            call_command('dumpdata', exclude=EXCLUDED, natural_foreign=True, indent=None, stdout=data)
            latest = MigrationRecorder.Migration.objects.filter(app='api').order_by('-id').first()
            counts = model_counts()
        data_bytes = data.getvalue().encode('utf-8')

        manifest = {
            'created_at': timezone.now().isoformat(),
            'api_migration': latest.name if latest else None,
            'counts': counts,
            'data_sha256': hashlib.sha256(data_bytes).hexdigest(),
            'encrypted': fernet is not None,
        }

        archive = io.BytesIO()
        media_files = 0
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr('data.json', data_bytes)
            for prefix, root in (('media', settings.MEDIA_ROOT), ('private', settings.PRIVATE_MEDIA_ROOT)):
                root = Path(root)
                if not root.exists():
                    continue
                for path in sorted(root.rglob('*')):
                    if path.is_file():
                        bundle.write(path, f'{prefix}/{path.relative_to(root).as_posix()}')
                        media_files += 1
            manifest['media_files'] = media_files
            bundle.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))

        payload = archive.getvalue()
        stamp = timezone.localtime().strftime('%Y%m%d-%H%M%S')
        filename = f'{BACKUP_PREFIX}{stamp}.zip'
        if fernet is not None:
            payload = fernet.encrypt(payload)
            filename += '.enc'
        target = output_dir / filename
        temporary = target.with_suffix(target.suffix + '.part')
        temporary.write_bytes(payload)
        temporary.replace(target)

        removed = self._apply_retention(output_dir, keep)
        self.stdout.write(self.style.SUCCESS(
            f'تمت النسخة: {target} ({len(payload) / 1024:.0f} KB، {media_files} صورة'
            f'{"، مشفّرة" if fernet else ""}). حُذفت {removed} نسخة قديمة.'
        ))

    def _apply_retention(self, output_dir: Path, keep: int) -> int:
        if keep <= 0:
            return 0
        backups = sorted(
            (path for path in output_dir.iterdir()
             if path.name.startswith(BACKUP_PREFIX) and path.name.endswith(('.zip', '.zip.enc'))),
            key=lambda path: path.name,
            reverse=True,
        )
        for old in backups[keep:]:
            old.unlink()
        return max(len(backups) - keep, 0)
