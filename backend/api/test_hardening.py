"""
اختبارات التحصين: تعديل قطعة لا يمحو بيعاً متزامناً، الرمز المشترك بين قطعتين
لا يختار إحداهما، والمدخلات غير الصالحة ترجع 400 لا 500.
"""

import io
from decimal import Decimal
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TransactionTestCase
from openpyxl import Workbook
from rest_framework.test import APIRequestFactory

from api import services
from api.models import SparePart, StockCount, StockCountLine
from api.search import normalize_text
from api.serializers import SparePartSerializer
from api.tests import BaseAPITestCase


class PartUpdateKeepsStockTests(BaseAPITestCase):

    def test_stale_edit_does_not_overwrite_sale(self):
        # نموذج التعديل فُتح على رصيد 50، ثم بيعت 3 قبل الحفظ.
        stale = SparePart.objects.get(pk=self.part.pk)
        services.create_invoice(cashier=self.employee, items=[{'spare_part': self.part, 'quantity': 3}])

        request = APIRequestFactory().patch('/')
        request.user = self.manager
        serializer = SparePartSerializer(
            stale, data={'name': 'طرمبة بنزين', 'selling_price': '30.00'}, partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 47)
        self.assertEqual((self.part.name, self.part.selling_price), ('طرمبة بنزين', Decimal('30.00')))
        self.assertIn(normalize_text('طرمبة'), self.part.search_text)
        self.assertEqual(serializer.data['stock_quantity'], 47)

    def test_full_update_sets_compatible_cars(self):
        response = self.client_for(self.manager).patch(
            f'/api/spare-parts/{self.part.pk}/', {'compatible_cars': [self.car_model.pk]}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['compatible_cars'], [self.car_model.pk])
        self.assertEqual(list(self.part.compatible_cars.values_list('pk', flat=True)), [self.car_model.pk])


class SharedCodeTests(BaseAPITestCase):
    """الرقم الأصلي نفسه لقطعة أصلية وأخرى تجارية."""

    def setUp(self):
        super().setUp()
        self.part.oem_number = '90915-YZZE1'
        self.part.save()
        self.commercial = SparePart.objects.create(
            name='فلتر زيت تجاري', part_number='OF-100C', category=self.category,
            oem_number='90915 YZZE1', purchase_price=Decimal('5'), selling_price=Decimal('12'),
            stock_quantity=8,
        )

    def test_lookup_refuses_to_guess(self):
        response = self.client_for(self.employee).get('/api/spare-parts/lookup/', {'code': '90915YZZE1'})
        self.assertEqual(response.status_code, 409)
        self.assertEqual({part['id'] for part in response.data['candidates']},
                         {self.part.pk, self.commercial.pk})

    def test_pos_search_lists_both(self):
        response = self.client_for(self.employee).get('/api/spare-parts/search-pos/', {'q': '90915-YZZE1'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual({part['id'] for part in response.data}, {self.part.pk, self.commercial.pk})

    def test_part_number_beats_shared_oem(self):
        response = self.client_for(self.employee).get('/api/spare-parts/lookup/', {'code': 'of 100c'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], self.commercial.pk)

    def test_stock_count_scan_is_not_counted_on_a_guess(self):
        count = StockCount.objects.create(title='رف الفلاتر', created_by=self.supervisor)
        response = self.client_for(self.supervisor).post(
            f'/api/stock-counts/{count.pk}/lines/', {'code': '90915-YZZE1', 'mode': 'add'}, format='json',
        )
        self.assertEqual(response.status_code, 409)
        self.assertFalse(StockCountLine.objects.exists())


class MalformedInputTests(BaseAPITestCase):
    """مدخلات خاطئة من الرابط أو الطلب: 400 برسالة، لا خطأ خادم."""

    def assert_400(self, response, field):
        self.assertEqual(response.status_code, 400, getattr(response, 'data', response))
        self.assertIn(field, response.data)

    def test_query_params(self):
        manager = self.client_for(self.manager)
        self.assert_400(manager.get('/api/invoices/', {'customer': 'abc'}), 'customer')
        self.assert_400(manager.get('/api/invoices/', {'date_from': '2026-13-45'}), 'date_from')
        self.assert_400(manager.get('/api/payments/', {'bank_account': '1;drop'}), 'bank_account')
        self.assert_400(manager.get('/api/expenses/', {'date_to': 'أمس'}), 'date_to')
        self.assert_400(manager.get('/api/daily-summary/', {'opening_cash': 'NaN'}), 'opening_cash')
        self.assert_400(manager.post('/api/pricing/', {'part_ids': ['x']}, format='json'), 'part_ids')
        self.assert_400(manager.post('/api/pricing/', {'part_ids': 5}, format='json'), 'part_ids')

    def test_public_catalog_params(self):
        from rest_framework.test import APIClient
        anonymous = APIClient()
        self.assert_400(anonymous.get('/api/public/parts/', {'category_id': 'abc'}), 'category_id')
        self.assert_400(anonymous.get('/api/public/parts/', {'car_model_id': '99999999999'}), 'car_model_id')
        self.assertEqual(anonymous.get('/api/public/parts/', {'category_id': self.category.pk}).status_code, 200)

    def test_quantities(self):
        supervisor = self.client_for(self.supervisor)
        self.assert_400(
            supervisor.post(f'/api/spare-parts/{self.part.pk}/adjust-stock/',
                            {'stock_quantity': 10 ** 12}, format='json'),
            'stock_quantity',
        )
        count = StockCount.objects.create(title='جرد', created_by=self.supervisor)
        url = f'/api/stock-counts/{count.pk}/lines/'
        self.assert_400(supervisor.post(url, {'spare_part': 'abc'}, format='json'), 'spare_part')
        self.assert_400(supervisor.post(url, {'spare_part': self.part.pk, 'counted_quantity': -1},
                                        format='json'), 'counted_quantity')
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)


class ImportValidationTests(BaseAPITestCase):

    HEADER = ['رقم القطعة', 'الاسم', 'الفئة', 'سعر الشراء', 'سعر البيع', 'الكمية', 'الباركود']

    def upload(self, rows, **params):
        book = Workbook()
        for row in [self.HEADER, *rows]:
            book.active.append(row)
        output = io.BytesIO()
        book.save(output)
        return self.client_for(self.manager).post(
            '/api/spare-parts/import/',
            {'file': SimpleUploadedFile('parts.xlsx', output.getvalue()), **params}, format='multipart',
        )

    def row_errors(self, response):
        return {error['row']: ' '.join(error['messages']) for error in response.data['errors']}

    def test_duplicate_barcode_in_file_is_a_row_error(self):
        response = self.upload([
            ['BK-1', 'فحمة أمامي', 'فرامل', 10, 18, 2, '6281000000017'],
            ['BK-2', 'فحمة خلفي', 'فرامل', 10, 18, 2, '6281000000017'],
        ], dry_run='0')
        self.assertEqual(response.status_code, 400)
        self.assertIn('الباركود مكرر في الملف (الصف 2)', self.row_errors(response)[3])
        self.assertFalse(SparePart.objects.filter(part_number__startswith='BK-').exists())

    def test_non_numbers_and_out_of_range_values(self):
        response = self.upload([
            ['N-1', 'قطعة', 'عام', 'NaN', 10, 1, None],
            ['N-2', 'قطعة', 'عام', 5, 'Infinity', 1, None],
            ['N-3', 'قطعة', 'عام', 5, 10, '1e12', None],
            ['N-4', 'قطعة', 'عام', 5, '1e15', 1, None],
            ['N' * 101, 'قطعة', 'عام', 5, 10, 1, None],
        ])
        self.assertEqual(response.status_code, 200)
        errors = self.row_errors(response)
        self.assertEqual(sorted(errors), [2, 3, 4, 5, 6])
        self.assertIn('سعر الشراء غير رقمي', errors[2])
        self.assertIn('سعر البيع غير رقمي', errors[3])
        self.assertIn('الكمية أكبر من الحد', errors[4])
        self.assertIn('سعر البيع أكبر من الحد', errors[5])
        self.assertIn('رقم القطعة أطول من 100', errors[6])


class DemoSeedTests(BaseAPITestCase):
    """بيانات العرض: تعبئة كاملة عبر الخدمات، و--reset محصور في وضع العرض."""

    def test_reset_requires_demo_mode(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command('seed_demo', reset=True, stdout=io.StringIO())
        self.assertTrue(SparePart.objects.filter(pk=self.part.pk).exists())


class DemoSeedResetTests(TransactionTestCase):
    """
    --reset يمسح القاعدة (flush): بلا معاملة اختبار مغلِّفة، كما يعمل فعلاً.
    PostgreSQL يرفض TRUNCATE داخل معاملة فيها قيود مؤجلة معلّقة.
    """

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_demo_seed_and_login_hint(self):
        from django.core.management import call_command
        from django.test import override_settings
        from rest_framework.test import APIClient
        from api.models import Invoice, PublicOrder

        import tempfile
        # --reset يمسح مجلدَي الصور: مجلدات مؤقتة لا مجلدات المشروع الحقيقية.
        with tempfile.TemporaryDirectory() as folder, override_settings(
            DEMO_MODE=True, MEDIA_ROOT=f'{folder}/media', PRIVATE_MEDIA_ROOT=f'{folder}/private',
        ):
            Path(folder, 'media').mkdir()
            Path(folder, 'media', 'old.jpg').write_bytes(b'x')
            call_command('seed_demo', reset=True, stdout=io.StringIO())
            self.assertFalse(Path(folder, 'media', 'old.jpg').exists())
            self.assertGreater(Invoice.objects.count(), 20)
            self.assertEqual(PublicOrder.objects.count(), 2)
            public = APIClient().get('/api/public/settings/').data
            self.assertTrue(public['demo_mode'])
            accounts = public['demo_accounts']
            self.assertEqual([a['username'] for a in accounts], ['demo', 'cashier'])
            login = APIClient().post('/api/auth/login/', {'username': 'demo', 'password': accounts[0]['password']},
                                     format='json')
            self.assertEqual(login.status_code, 200)
        public = APIClient().get('/api/public/settings/').data
        self.assertEqual((public['demo_mode'], public['demo_accounts']), (False, []))


class StaticHeadersTests(BaseAPITestCase):

    def test_service_worker_header_function_is_callable(self):
        # كان نصاً مسارياً فتسقط WhiteNoise عند الإقلاع في الإنتاج (DEBUG=False).
        from django.conf import settings
        headers = {}
        settings.WHITENOISE_ADD_HEADERS_FUNCTION(headers, '/x/sw.js', '/static/sw.js')
        self.assertEqual(headers['Service-Worker-Allowed'], '/')


class StaleCookieTests(BaseAPITestCase):

    def test_cookie_of_deleted_user_is_treated_as_anonymous(self):
        client, _ = self.login_client('emp1')
        self.employee.delete()
        # كان كل طلب يرجع 401 حتى الصفحات العامة، فيعلق الزائر في صفحة الدخول.
        self.assertEqual(client.get('/api/public/settings/').status_code, 200)
        self.assertEqual(client.get('/api/auth/me/').status_code, 401)


class FeaturedPartsLimitTests(BaseAPITestCase):

    def test_store_home_gets_a_sample_not_the_catalogue(self):
        from rest_framework.test import APIClient
        for index in range(15):
            SparePart.objects.create(
                name=f'قطعة {index}', part_number=f'FT-{index}', category=self.category,
                purchase_price=Decimal('1'), selling_price=Decimal('2'), is_featured=True,
            )
        client = APIClient()
        self.assertEqual(len(client.get('/api/public/featured-parts/').data), 12)
        self.assertEqual(len(client.get('/api/public/featured-parts/', {'limit': 4}).data), 4)
        self.assertEqual(len(client.get('/api/public/featured-parts/', {'limit': 'x'}).data), 12)


class DemoGuardTests(BaseAPITestCase):
    """نسخة العرض: لا يعطّل زائرٌ التجربةَ على غيره، ويبقى البيع وبقية العمل مفتوحاً."""

    def png(self):
        from PIL import Image
        buffer = io.BytesIO()
        Image.new('RGB', (8, 8), 'white').save(buffer, 'PNG')
        return SimpleUploadedFile('x.png', buffer.getvalue(), content_type='image/png')

    def test_sensitive_operations_are_blocked(self):
        from django.test import override_settings
        manager = self.client_for(self.manager)
        with override_settings(DEMO_MODE=True):
            for response in (
                manager.delete(f'/api/categories/{self.category.pk}/'),
                manager.post('/api/users/', {'username': 'x', 'password': 'StrongPass123!', 'role': 'manager'},
                             format='json'),
                manager.patch(f'/api/users/{self.employee.pk}/', {'role': 'manager'}, format='json'),
                manager.put('/api/admin/settings/', {'site_name': 'محل مخرّب'}, format='json'),
                manager.post('/api/contact-methods/', {'platform_name': 'x', 'value': 'x', 'icon_name': 'x'},
                             format='json'),
                manager.patch(f'/api/spare-parts/{self.part.pk}/', {'image': self.png()}, format='multipart'),
            ):
                self.assertEqual(response.status_code, 403, getattr(response, 'data', response.content))
                self.assertIn('النسخة التجريبية', response.json()['detail'])
            # ما يعرض قيمة النظام يبقى مفتوحاً.
            sale = manager.post('/api/invoices/', {
                'items': [{'spare_part': self.part.pk, 'quantity': 1}],
                'payments': [{'method': 'cash', 'amount': '25'}],
            }, format='json')
            self.assertEqual(sale.status_code, 201, sale.data)
            edit = manager.patch(f'/api/spare-parts/{self.part.pk}/', {'selling_price': '26.00'}, format='json')
            self.assertEqual(edit.status_code, 200, edit.data)

        self.part.refresh_from_db()
        self.assertFalse(self.part.image)
        self.assertTrue(type(self.category).objects.filter(pk=self.category.pk).exists())
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.role, 'employee')

    def test_nothing_is_blocked_outside_demo_mode(self):
        response = self.client_for(self.manager).put('/api/admin/settings/', {'site_name': 'محلي'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)


class ShareTagsTests(BaseAPITestCase):
    """وسوم المشاركة في HTML الخادم (واتساب لا يشغّل JavaScript)، لنسخة العرض فقط."""

    def render_home(self, path='/', **settings_overrides):
        import tempfile
        from django.test import override_settings
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'index.html').write_text(
                '<html><head><title>اسبير</title></head><body><div id="root"></div></body></html>',
                encoding='utf-8',
            )
            templates = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [folder]}]
            with override_settings(TEMPLATES=templates, **settings_overrides):
                return self.client.get(path).content.decode('utf-8')

    def test_demo_home_has_share_tags(self):
        html = self.render_home(DEMO_MODE=True)
        self.assertIn('property="og:title"', html)
        self.assertIn('/static/landing/og.jpg', html)
        self.assertIn('rel="canonical"', html)
        self.assertEqual(html.count('<title>'), 1)

    def test_real_shop_and_inner_pages_get_none(self):
        self.assertNotIn('og:title', self.render_home(DEMO_MODE=False))
        self.assertNotIn('og:title', self.render_home('/store', DEMO_MODE=True))
