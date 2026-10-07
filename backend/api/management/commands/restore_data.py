"""
استعادة نسخة احتياطية أنشأها backup_data.

    python manage.py migrate
    python manage.py restore_data backups/backup-20261007-230000.zip [--force]

تتحقق من بصمة البيانات قبل أي كتابة، وترفض الاستعادة فوق قاعدة فيها بيانات
تشغيل ما لم يُمرَّر --force (يمسح القاعدة الحالية كاملة أولاً). بعد التحميل
تُقارَن أعداد السجلات بما في بيان النسخة.
"""

import hashlib
import io
import json
import tempfile
import zipfile
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.management.commands.backup_data import get_fernet, model_counts
from api.models import Invoice, SparePart


class Command(BaseCommand):
    help = 'استعادة نسخة احتياطية (بيانات + صور) من ملف backup_data.'

    def add_arguments(self, parser):
        parser.add_argument('archive', help='مسار ملف النسخة (.zip أو .zip.enc).')
        parser.add_argument('--force', action='store_true',
                            help='مسح القاعدة الحالية قبل الاستعادة (لا رجوع عنه).')

    def handle(self, *args, **options):
        path = Path(options['archive'])
        if not path.exists():
            raise CommandError(f'الملف غير موجود: {path}')

        payload = path.read_bytes()
        if path.name.endswith('.enc'):
            fernet = get_fernet()
            if fernet is None:
                raise CommandError('النسخة مشفّرة: اضبط DJANGO_BACKUP_KEY بالمفتاح نفسه المستخدم عند النسخ.')
            try:
                payload = fernet.decrypt(payload)
            except Exception as exc:
                raise CommandError('تعذّر فك التشفير: المفتاح غير مطابق أو الملف تالف.') from exc

        try:
            bundle = zipfile.ZipFile(io.BytesIO(payload))
            manifest = json.loads(bundle.read('manifest.json'))
            data = bundle.read('data.json')
        except (zipfile.BadZipFile, KeyError) as exc:
            raise CommandError('الملف ليس نسخة احتياطية صالحة من هذا النظام.') from exc

        if hashlib.sha256(data).hexdigest() != manifest.get('data_sha256'):
            raise CommandError('بصمة البيانات لا تطابق البيان: الملف تالف. لم يُستعد شيء.')

        if (SparePart.objects.exists() or Invoice.objects.exists()) and not options['force']:
            raise CommandError(
                'القاعدة الحالية فيها بيانات تشغيل. استخدم --force لمسحها والاستعادة فوقها.'
            )

        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as fixture:
            fixture.write(data)
            fixture_path = fixture.name

        try:
            with transaction.atomic():
                if options['force']:
                    call_command('flush', interactive=False, verbosity=0)
                call_command('loaddata', fixture_path, verbosity=0)
        finally:
            Path(fixture_path).unlink(missing_ok=True)

        roots = {
            'media/': Path(settings.MEDIA_ROOT).resolve(),
            'private/': Path(settings.PRIVATE_MEDIA_ROOT).resolve(),
        }
        restored_media = 0
        for name in bundle.namelist():
            prefix = next((p for p in roots if name.startswith(p)), None)
            if prefix is None or name.endswith('/'):
                continue
            root = roots[prefix]
            target = (root / name[len(prefix):]).resolve()
            # احتواء بعد حلّ المسار: أسماء مثل ../ أو C:evil على ويندوز تُتجاهل.
            if root not in target.parents:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bundle.read(name))
            restored_media += 1

        mismatches = {
            label: (expected, actual)
            for label, expected in manifest.get('counts', {}).items()
            if (actual := model_counts().get(label)) is not None and actual != expected
        }
        if mismatches:
            raise CommandError(f'اكتملت الاستعادة لكن الأعداد لا تطابق البيان: {mismatches}')

        self.stdout.write(self.style.SUCCESS(
            f"تمت الاستعادة من نسخة {manifest.get('created_at')}: "
            f"{sum(manifest.get('counts', {}).values())} سجل و{restored_media} صورة، والأعداد مطابقة."
        ))
