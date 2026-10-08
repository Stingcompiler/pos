"""
اختبارات نظام إدارة قطع الغيار.

تغطي:
- صحة النماذج (تحقق التواريخ، إعدادات الموقع، شروط الدفع البنكي).
- المصادقة عبر الكوكيز والأدوار (RBAC).
- منطق المخزون الذرّي (بيع، توريد، تكلفة مرجّحة، سجل الحركات).
- الطلبات الخارجية (تأكيد/إلغاء، منع الخصم المزدوج، إرجاع المخزون، ومنع
  إرجاع الطلب المؤكد إلى قيد الانتظار بعد أن يُفسد المخزون).
- ثبات الفواتير بعد الإنشاء.
- سياسة كلمات المرور وحدود رفع الصور.
"""

from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from api import services, validators
from api.models import (
    CarModel,
    Category,
    ContactMessage,
    Customer,
    Invoice,
    InvoiceItem,
    Notification,
    PublicOrder,
    PublicOrderItem,
    SiteSetting,
    SparePart,
    StockMovement,
    Supplier,
    SupplyDeal,
)

User = get_user_model()

PASSWORD = 'StrongPass123'


class BaseAPITestCase(TestCase):
    """بيانات أساسية مشتركة + أدوات عميل الـ API."""

    def setUp(self):
        # عدّادات تحديد المعدل (الدخول 10/دقيقة) في الذاكرة المؤقتة: بدون
        # تصفيرها يتأثر اختبار بعدد محاولات الدخول في الاختبارات التي سبقته.
        cache.clear()
        self.manager = User.objects.create_user(
            username='manager1', password=PASSWORD, role='manager'
        )
        self.supervisor = User.objects.create_user(
            username='super1', password=PASSWORD, role='supervisor'
        )
        self.employee = User.objects.create_user(
            username='emp1', password=PASSWORD, role='employee'
        )

        self.category = Category.objects.create(name='محركات')
        self.car_model = CarModel.objects.create(
            brand='Toyota', model_name='Corolla', year_start=2015, year_end=2020
        )
        self.supplier = Supplier.objects.create(
            company_name='شركة المحركات', phone_number='0912345678'
        )
        self.part = SparePart.objects.create(
            name='فلتر زيت',
            part_number='OF-100',
            category=self.category,
            supplier=self.supplier,
            purchase_price=Decimal('10.00'),
            selling_price=Decimal('25.00'),
            stock_quantity=50,
        )

    def client_for(self, user):
        """عميل API مُصادَق مباشرةً (لتغطية صلاحيات الأدوار)."""
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def login_client(self, username, password=PASSWORD):
        """تسجيل دخول حقيقي عبر الكوكيز وإرجاع العميل والاستجابة."""
        client = APIClient()
        response = client.post(
            '/api/auth/login/',
            {'username': username, 'password': password},
            format='json',
        )
        return client, response
class ModelValidationTests(BaseAPITestCase):
    """تحققات النماذج الأساسية."""

    def test_car_model_rejects_inverted_years(self):
        with self.assertRaises(ValidationError):
            CarModel.objects.create(brand='Kia', model_name='Rio', year_start=2020, year_end=2010)

    def test_site_setting_is_singleton(self):
        first = SiteSetting.objects.create(site_name='اسم أ')
        second = SiteSetting.objects.create(site_name='اسم ب')
        self.assertEqual(first.pk, 1)
        self.assertEqual(second.pk, 1)
        self.assertEqual(SiteSetting.objects.count(), 1)
        self.assertEqual(SiteSetting.objects.get(pk=1).site_name, 'اسم ب')

    def test_cash_invoice_clears_bank_fields(self):
        invoice = Invoice.objects.create(
            cashier=self.employee, total_amount=Decimal('120.00'),
            payment_method='cash', bank_name='بنك', reference_id='X', sender_account_number='1',
        )
        self.assertIsNone(invoice.bank_name)
        self.assertIsNone(invoice.reference_id)
        self.assertIsNone(invoice.sender_account_number)

    def test_bank_invoice_requires_bank_fields(self):
        with self.assertRaises(ValidationError):
            Invoice.objects.create(
                cashier=self.employee, total_amount=Decimal('120.00'),
                payment_method='bank', bank_name='', reference_id='', sender_account_number='',
            )


class AuthTests(BaseAPITestCase):
    """المصادقة عبر الكوكيز."""

    def test_login_sets_httponly_cookies_and_returns_user(self):
        client, response = self.login_client('manager1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'manager')
        self.assertIn('access_token', response.cookies)
        self.assertTrue(response.cookies['access_token']['httponly'])

    def test_login_rejects_wrong_password(self):
        _, response = self.login_client('manager1', 'WrongPassword!')
        self.assertEqual(response.status_code, 401)

    def test_me_requires_authentication(self):
        client = APIClient()
        response = client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 401)

    def test_me_returns_authenticated_user(self):
        client, _ = self.login_client('emp1')
        response = client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'emp1')

    def test_logout_blacklists_refresh_token(self):
        client, _ = self.login_client('emp1')
        refresh_token = client.cookies.get('refresh_token').value
        logout_response = client.post('/api/auth/logout/')
        self.assertEqual(logout_response.status_code, 200)

        replay = APIClient()
        replay.cookies['refresh_token'] = refresh_token
        refresh_response = replay.post('/api/auth/refresh/')
        self.assertEqual(refresh_response.status_code, 401)

    def test_inactive_user_with_correct_password_is_told_account_is_disabled(self):
        """
        الحساب المعطّل يعطي 403 «غير مفعل» لا 401 «بيانات خاطئة».

        ModelBackend.authenticate يشترط is_active فيعيد None للحساب المعطّل،
        فكان فحص `not user.is_active` كوداً ميتاً لا يُنفَّذ أبداً. النتيجة
        القديمة: الموظف المعطّل يرى «بيانات الدخول غير صحيحة» فيظنّ أنه نسي
        كلمة المرور ويعيد المحاولات حتى يُقفل بحدّ المعدّل.
        """
        self.employee.is_active = False
        self.employee.save(update_fields=['is_active'])
        _, response = self.login_client('emp1')
        self.assertEqual(response.status_code, 403)
        self.assertIn('غير مفعل', response.data['error'])

    def test_inactive_user_with_wrong_password_gets_generic_401(self):
        """
        لا نكشف وجود الحساب المعطّل لمن لا يعرف كلمة المرور.

        التمييز بين «غير مفعل» و«بيانات خاطئة» يحدث فقط لمن أثبت معرفته
        بكلمة المرور الصحيحة، وإلا صار الفحص وسيلة لسرد أسماء الحسابات.
        """
        self.employee.is_active = False
        self.employee.save(update_fields=['is_active'])
        _, response = self.login_client('emp1', password='WrongPassword!2026')
        self.assertEqual(response.status_code, 401)

    def test_unknown_username_gets_generic_401(self):
        """اسم مستخدم غير موجود يعطي نفس رسالة كلمة المرور الخاطئة."""
        _, response = self.login_client('ghost_user_does_not_exist')
        self.assertEqual(response.status_code, 401)


class RolePermissionTests(BaseAPITestCase):
    """صلاحيات الأدوار على الـ API."""

    def test_employee_cannot_delete_spare_part(self):
        client = self.client_for(self.employee)
        response = client.delete(f'/api/spare-parts/{self.part.pk}/')
        self.assertEqual(response.status_code, 403)

    def test_supervisor_cannot_delete_spare_part(self):
        client = self.client_for(self.supervisor)
        response = client.delete(f'/api/spare-parts/{self.part.pk}/')
        self.assertEqual(response.status_code, 403)

    def test_manager_can_create_category(self):
        client = self.client_for(self.manager)
        response = client.post('/api/categories/', {'name': 'كهرباء'}, format='json')
        self.assertEqual(response.status_code, 201)

    def test_employee_can_create_invoice(self):
        client = self.client_for(self.employee)
        response = client.post('/api/invoices/', {
            'items': [{'spare_part': self.part.pk, 'quantity': 2}],
            'payment_method': 'cash',
        }, format='json')
        self.assertEqual(response.status_code, 201)

    def test_employee_only_sees_own_invoices(self):
        services.create_invoice(
            cashier=self.manager,
            items=[{'spare_part': self.part, 'quantity': 1}],
        )
        client = self.client_for(self.employee)
        response = client.get('/api/invoices/')
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 0)

    def test_employee_cannot_access_users_endpoint(self):
        client = self.client_for(self.employee)
        response = client.get('/api/users/')
        self.assertEqual(response.status_code, 403)
class InventoryServiceTests(BaseAPITestCase):
    """منطق المخزون الذرّي عبر طبقة الخدمات."""

    def test_invoice_creation_deducts_stock_and_records_movement(self):
        invoice = services.create_invoice(
            cashier=self.employee,
            items=[{'spare_part': self.part, 'quantity': 3}],
        )
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 47)
        self.assertEqual(invoice.total_amount, Decimal('75.00'))

        movement = StockMovement.objects.get(spare_part=self.part)
        self.assertEqual(movement.change, -3)
        self.assertEqual(movement.quantity_after, 47)
        self.assertEqual(movement.reason, StockMovement.Reason.SALE)

    def test_invoice_records_cost_price_snapshot(self):
        services.create_invoice(
            cashier=self.employee,
            items=[{'spare_part': self.part, 'quantity': 2}],
        )
        item = InvoiceItem.objects.get()
        self.assertEqual(item.cost_price, Decimal('10.00'))
        self.assertEqual(item.unit_price, Decimal('25.00'))
        self.assertEqual(item.profit, Decimal('30.00'))

    def test_invoice_ignores_client_supplied_price_for_employee(self):
        """الموظف لا يستطيع فرض سعر أقل من سعر البيع الرسمي."""
        invoice = services.create_invoice(
            cashier=self.employee,
            items=[{'spare_part': self.part, 'quantity': 1, 'unit_price': Decimal('1.00')}],
            allow_price_override=False,
        )
        self.assertEqual(invoice.total_amount, Decimal('25.00'))

    def test_insufficient_stock_raises_and_changes_nothing(self):
        with self.assertRaises(services.InventoryError):
            services.create_invoice(
                cashier=self.employee,
                items=[{'spare_part': self.part, 'quantity': 999}],
            )
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_multi_item_failure_rolls_back_entire_invoice(self):
        """فشل بند واحد يجب أن يُلغي الفاتورة كاملة (ذرّية)."""
        other = SparePart.objects.create(
            name='فلتر هواء', part_number='AF-200', category=self.category,
            purchase_price=Decimal('5.00'), selling_price=Decimal('12.00'), stock_quantity=1,
        )
        with self.assertRaises(services.InventoryError):
            services.create_invoice(
                cashier=self.employee,
                items=[
                    {'spare_part': self.part, 'quantity': 2},
                    {'spare_part': other, 'quantity': 5},
                ],
            )
        self.part.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(other.stock_quantity, 1)
        self.assertEqual(Invoice.objects.count(), 0)

    def test_adjust_stock_records_delta(self):
        services.adjust_stock(self.part.pk, 40, user=self.manager)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 40)
        movement = StockMovement.objects.get(reason=StockMovement.Reason.ADJUSTMENT)
        self.assertEqual(movement.change, -10)

    def test_stock_quantity_cannot_be_edited_directly_via_api(self):
        """تعديل الكمية عبر الـ API مباشرةً يجب أن يُتجاهل."""
        client = self.client_for(self.manager)
        response = client.patch(
            f'/api/spare-parts/{self.part.pk}/',
            {'stock_quantity': 999},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)


class SupplyDealTests(BaseAPITestCase):
    """التوريد ومتوسط التكلفة المرجّح."""

    def test_supply_deal_increases_stock_and_weighted_cost(self):
        services.create_supply_deal(
            supplier=self.supplier,
            spare_part=self.part,
            quantity_added=50,
            purchase_price=Decimal('20.00'),
            user=self.manager,
        )
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 100)
        # (50*10 + 50*20) / 100 = 15
        self.assertEqual(self.part.purchase_price, Decimal('15.00'))

        deal = SupplyDeal.objects.get()
        self.assertEqual(deal.total_cost, Decimal('1000.00'))

    def test_supply_deal_via_api(self):
        client = self.client_for(self.manager)
        response = client.post('/api/supply-deals/', {
            'supplier': self.supplier.pk,
            'spare_part': self.part.pk,
            'quantity_added': 10,
            'purchase_price': '12.50',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 60)

    def test_deleting_supply_deal_reverses_stock(self):
        deal = services.create_supply_deal(
            supplier=self.supplier, spare_part=self.part,
            quantity_added=10, purchase_price=Decimal('12.00'),
        )
        services.delete_supply_deal(deal)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)


class PublicOrderTests(BaseAPITestCase):
    """الطلبات الخارجية: التأكيد، الإلغاء، ومنع الخصم المزدوج."""

    def _create_order(self, quantity=2):
        order = PublicOrder.objects.create(
            customer_name='عميل', phone_number='0999', total_amount=Decimal('50.00'),
        )
        PublicOrderItem.objects.create(
            order=order, spare_part=self.part, quantity=quantity,
            unit_price=self.part.selling_price,
        )
        return order

    def test_confirm_order_deducts_stock(self):
        order = self._create_order(quantity=2)
        services.confirm_public_order(order)
        self.part.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 48)
        self.assertEqual(order.status, PublicOrder.Status.CONFIRMED)

    def test_confirm_is_idempotent(self):
        order = self._create_order(quantity=2)
        services.confirm_public_order(order)
        services.confirm_public_order(order)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 48)

    def test_cancel_confirmed_order_restores_stock(self):
        order = self._create_order(quantity=2)
        services.confirm_public_order(order)
        services.cancel_public_order(order)
        self.part.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(order.status, PublicOrder.Status.CANCELLED)

    def test_confirm_insufficient_stock_raises(self):
        order = self._create_order(quantity=999)
        with self.assertRaises(services.InventoryError):
            services.confirm_public_order(order)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)

    def test_cannot_confirm_cancelled_order(self):
        order = self._create_order()
        services.cancel_public_order(order)
        with self.assertRaises(services.InventoryError):
            services.confirm_public_order(order)

    def test_public_order_api_confirms_via_service(self):
        order = self._create_order(quantity=1)
        client = self.client_for(self.manager)
        response = client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'confirmed'}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 49)


class InvoiceImmutabilityTests(BaseAPITestCase):
    """الفواتير غير قابلة للتعديل أو الحذف بعد الإنشاء."""

    def setUp(self):
        super().setUp()
        self.invoice = services.create_invoice(
            cashier=self.manager,
            items=[{'spare_part': self.part, 'quantity': 1}],
        )
        self.client_manager = self.client_for(self.manager)

    def test_invoice_update_is_rejected(self):
        response = self.client_manager.put(
            f'/api/invoices/{self.invoice.pk}/',
            {'items': [], 'payment_method': 'cash'},
            format='json',
        )
        self.assertEqual(response.status_code, 405)

    def test_invoice_delete_is_rejected(self):
        response = self.client_manager.delete(f'/api/invoices/{self.invoice.pk}/')
        self.assertEqual(response.status_code, 405)


class PublicAPITests(BaseAPITestCase):
    """نقاط النهاية العامة."""

    def test_featured_parts_only_returns_featured(self):
        SparePart.objects.create(
            name='مميز', part_number='F-1', category=self.category,
            purchase_price=Decimal('1'), selling_price=Decimal('2'),
            stock_quantity=5, is_featured=True,
        )
        client = APIClient()
        response = client.get('/api/public/featured-parts/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'مميز')

    def test_public_contact_submission_creates_message_and_notification(self):
        client = APIClient()
        response = client.post('/api/public/contact/', {
            'name': 'مرسل', 'email': 'a@b.com', 'phone': '099', 'message': 'استفسار',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ContactMessage.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_public_order_creation_uses_server_price(self):
        client = APIClient()
        response = client.post('/api/public-orders/', {
            'customer_name': 'زائر', 'phone_number': '0999',
            'items': [{'spare_part': self.part.pk, 'quantity': 2, 'unit_price': '1.00'}],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        order = PublicOrder.objects.get()
        self.assertEqual(order.total_amount, Decimal('50.00'))

    def test_public_settings_returns_branding_and_catalog(self):
        client = APIClient()
        response = client.get('/api/public/settings/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('settings', response.data)
        self.assertIn('categories', response.data)
        self.assertIn('car_models', response.data)

    def test_public_parts_list_is_paginated(self):
        """الكتالوج العام صفحات بعدد إجمالي ورابط تالٍ، لا قائمة مقصوصة."""
        for index in range(30):
            SparePart.objects.create(
                name=f'قطعة {index}', part_number=f'PG-{index}', category=self.category,
                purchase_price=Decimal('1'), selling_price=Decimal('2'), stock_quantity=1,
            )
        client = APIClient()
        response = client.get('/api/public/parts/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 31)
        self.assertEqual(len(response.data['results']), 24)
        self.assertIsNotNone(response.data['next'])
        last_page = client.get('/api/public/parts/', {'page': 2})
        self.assertEqual(len(last_page.data['results']), 7)
class SensitiveDataPermissionTests(BaseAPITestCase):
    """
    البيانات الحسّاسة (الإحصاءات، التقارير المالية، رسائل العملاء، حذف
    العملاء/الموردين) يجب أن تكون مقصورة على المدير والمشرف.

    كانت هذه الثغرة قائمة: CustomerViewSet/SupplierViewSet كانتا تعتمدان
    IsAuthenticated فقط، أي أن أي موظف يستطيع حذف العملاء والموردين، وكانت
    التقارير المالية مكشوفة له.
    """

    def test_employee_cannot_read_dashboard_stats(self):
        client = self.client_for(self.employee)
        response = client.get('/api/dashboard/stats/')
        self.assertEqual(response.status_code, 403)

    def test_supervisor_can_read_dashboard_stats(self):
        client = self.client_for(self.supervisor)
        response = client.get('/api/dashboard/stats/')
        self.assertEqual(response.status_code, 200)

    def test_employee_cannot_read_sales_reports(self):
        client = self.client_for(self.employee)
        response = client.get('/api/reports/sales/')
        self.assertEqual(response.status_code, 403)

    def test_manager_can_read_sales_reports(self):
        client = self.client_for(self.manager)
        response = client.get('/api/reports/sales/')
        self.assertEqual(response.status_code, 200)

    def test_employee_cannot_delete_customer(self):
        customer = Customer.objects.create(name='عميل', phone='0912000000')
        client = self.client_for(self.employee)
        response = client.delete(f'/api/customers/{customer.pk}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Customer.objects.filter(pk=customer.pk).exists())

    def test_supervisor_cannot_delete_customer(self):
        customer = Customer.objects.create(name='عميل', phone='0912000000')
        client = self.client_for(self.supervisor)
        response = client.delete(f'/api/customers/{customer.pk}/')
        self.assertEqual(response.status_code, 403)

    def test_manager_can_delete_customer(self):
        customer = Customer.objects.create(name='عميل', phone='0912000000')
        client = self.client_for(self.manager)
        response = client.delete(f'/api/customers/{customer.pk}/')
        self.assertEqual(response.status_code, 204)

    def test_employee_cannot_delete_supplier(self):
        client = self.client_for(self.employee)
        response = client.delete(f'/api/suppliers/{self.supplier.pk}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Supplier.objects.filter(pk=self.supplier.pk).exists())

    def test_employee_cannot_read_contact_messages(self):
        ContactMessage.objects.create(name='مرسل', email='a@b.com', message='استفسار')
        client = self.client_for(self.employee)
        response = client.get('/api/contact-messages/')
        self.assertEqual(response.status_code, 403)

    def test_manager_can_read_contact_messages(self):
        ContactMessage.objects.create(name='مرسل', email='a@b.com', message='استفسار')
        client = self.client_for(self.manager)
        response = client.get('/api/contact-messages/')
        self.assertEqual(response.status_code, 200)

    def test_employee_cannot_delete_supply_deal(self):
        deal = services.create_supply_deal(
            supplier=self.supplier,
            spare_part=self.part,
            quantity_added=5,
            purchase_price=Decimal('10.00'),
        )
        client = self.client_for(self.employee)
        response = client.delete(f'/api/supply-deals/{deal.pk}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(SupplyDeal.objects.filter(pk=deal.pk).exists())

    def test_employee_cannot_adjust_stock(self):
        client = self.client_for(self.employee)
        response = client.post(
            f'/api/spare-parts/{self.part.pk}/adjust-stock/',
            {'stock_quantity': 999},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)

    def test_supervisor_can_adjust_stock(self):
        client = self.client_for(self.supervisor)
        response = client.post(
            f'/api/spare-parts/{self.part.pk}/adjust-stock/',
            {'stock_quantity': 77},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 77)

    def test_employee_can_read_stock_movements(self):
        """سجل الحركات مطلوب لشاشة نقطة البيع — القراءة متاحة للموظف."""
        client = self.client_for(self.employee)
        response = client.get('/api/stock-movements/')
        self.assertEqual(response.status_code, 200)

    def test_employee_cannot_manage_contact_methods(self):
        client = self.client_for(self.employee)
        response = client.post(
            '/api/contact-methods/',
            {'platform_name': 'هاتف', 'value': '0912', 'icon_name': 'Phone'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
class PublicOrderStatusTransitionTests(BaseAPITestCase):
    """
    منع الخصم المزدوج عند تبديل حالات الطلب الخارجي.

    الخلل الأصلي: إرجاع طلب مؤكد إلى «قيد الانتظار» كان يغيّر الحالة دون
    إرجاع المخزون، فيصبح تأكيده لاحقاً خصماً ثانياً لنفس البنود — فتُخصم
    رقعة واحدة مرتين ولا يظهر ذلك إلا عند الجرد.
    """

    def _create_order(self, quantity=5):
        order = PublicOrder.objects.create(
            customer_name='عميل', phone_number='0999',
            total_amount=self.part.selling_price * quantity,
        )
        PublicOrderItem.objects.create(
            order=order, spare_part=self.part, quantity=quantity,
            unit_price=self.part.selling_price,
        )
        return order

    def test_reverting_confirmed_order_to_pending_is_rejected(self):
        order = self._create_order()
        client = self.client_for(self.manager)
        client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'confirmed'}, format='json'
        )

        response = client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'pending'}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, PublicOrder.Status.CONFIRMED)

    def test_stock_is_not_double_deducted_after_rejected_revert(self):
        order = self._create_order(quantity=5)
        client = self.client_for(self.manager)

        # التأكيد الأول: 50 → 45
        client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'confirmed'}, format='json'
        )
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 45)

        # محاولة الإرجاع مرفوضة — لا تُغيّر الحالة ولا المخزون
        client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'pending'}, format='json'
        )

        # التأكيد الثاني: يجب أن يبقى 45 لا 40
        client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'confirmed'}, format='json'
        )
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 45)
        self.assertEqual(
            StockMovement.objects.filter(
                reason=StockMovement.Reason.PUBLIC_ORDER_CONFIRMED
            ).count(),
            1,
        )

    def test_cancel_path_used_instead_restores_stock(self):
        """المسار البديل الذي نوجّه المستخدم إليه يعمل فعلاً."""
        order = self._create_order(quantity=5)
        client = self.client_for(self.manager)
        client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'confirmed'}, format='json'
        )
        response = client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'cancelled'}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.part.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(order.status, PublicOrder.Status.CANCELLED)

    def test_pending_to_pending_is_a_no_op(self):
        """إرسال الحالة الحالية نفسها لا يجب أن يخصم شيئاً."""
        order = self._create_order(quantity=5)
        client = self.client_for(self.manager)
        client.patch(
            f'/api/public-orders/{order.pk}/', {'status': 'pending'}, format='json'
        )
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(StockMovement.objects.count(), 0)


class PasswordPolicyTests(BaseAPITestCase):
    """
    مدقّقات كلمة المرور يجب أن تُطبَّق فعلياً عند إنشاء المستخدم.

    AUTH_PASSWORD_VALIDATORS إعداد سلبي: لا يعمل تلقائياً على مسار
    UserCreateSerializer، فبدون استدعاء validate_password صراحةً كان يمكن
    إنشاء مستخدم بكلمة مرور «12345678» رغم تعريف المدقّقات في الإعدادات.
    """

    def _create_user_via_api(self, username, password):
        client = self.client_for(self.manager)
        return client.post('/api/users/', {
            'username': username,
            'password': password,
            'role': 'employee',
        }, format='json')

    def test_numeric_password_is_rejected(self):
        response = self._create_user_via_api('newuser1', '12345678')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='newuser1').exists())

    def test_common_password_is_rejected(self):
        response = self._create_user_via_api('newuser1', 'password')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='newuser1').exists())

    def test_password_similar_to_username_is_rejected(self):
        response = self._create_user_via_api('ahmedali', 'ahmedali2026')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='ahmedali').exists())

    def test_strong_password_is_accepted(self):
        response = self._create_user_via_api('newuser1', 'Xk9$mQ2Lp7nR')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username='newuser1').exists())


class ImageUploadValidationTests(BaseAPITestCase):
    """حدود حجم وأبعاد وصيغة الصور المرفوعة."""

    @staticmethod
    def _png(width, height):
        buffer = BytesIO()
        Image.new('RGB', (width, height), 'white').save(buffer, format='PNG')
        buffer.seek(0)
        return buffer

    def test_oversized_dimensions_are_rejected(self):
        with self.assertRaises(ValidationError):
            validators.validate_image_upload(self._png(3000, 10))

    def test_oversized_file_is_rejected(self):
        big = SimpleUploadedFile(
            'big.png', b'\x00' * (6 * 1024 * 1024), content_type='image/png'
        )
        with self.assertRaises(ValidationError):
            validators.validate_image_upload(big)

    def test_non_image_file_is_rejected(self):
        fake = SimpleUploadedFile(
            'fake.png', b'this is definitely not an image', content_type='image/png'
        )
        with self.assertRaises(ValidationError):
            validators.validate_image_upload(fake)

    def test_valid_image_passes_and_pointer_is_rewound(self):
        value = self._png(120, 90)
        # لا يرفع استثناء
        validators.validate_image_upload(value)
        # المؤشّر يجب أن يعود للبداية وإلا حُفظ ملف ناقص بصمت.
        self.assertEqual(value.tell(), 0)

    def test_part_serializer_rejects_oversized_image(self):
        """المدقّق مربوط فعلاً بحقول النموذج ويظهر عبر الـ API."""
        client = self.client_for(self.manager)
        response = client.post(
            '/api/categories/',
            {'name': 'فئة بمدقّق', 'image': self._png(3000, 10)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Category.objects.filter(name='فئة بمدقّق').exists())
class Phase2RegressionTests(BaseAPITestCase):
    """
    اختبارات بنود المرحلة الثانية المنفَّذة.

    تغطّي: سعر الشراء للقراءة فقط عند التحديث (P2-3)، لقطة تكلفة الطلب
    الخارجي (P2-4)، حماية السجل التدقيقي من الحذف (P2-5)، والتحذير المبكر
    من نقص المخزون في الطلبات العامة (P1-8).
    """

    # ── P2-3: purchase_price للقراءة فقط عند التحديث ───────────────────────

    def test_update_cannot_change_purchase_price(self):
        """
        تعديل سعر الشراء يدوياً يُفسد متوسط التكلفة وتقارير الأرباح، ولا
        يُسجَّل في سجل الحركات (تعديل سعري لا كمّي). يجب أن يُتجاهل.
        """
        client = self.client_for(self.manager)
        response = client.patch(
            f'/api/spare-parts/{self.part.pk}/',
            {'purchase_price': '999.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.part.refresh_from_db()
        self.assertEqual(self.part.purchase_price, Decimal('10.00'))

    def test_update_still_allows_selling_price_change(self):
        """سعر البيع ليس محمياً بنفس القيد — التأكد من أن المنع ليس مطلقاً."""
        client = self.client_for(self.manager)
        response = client.patch(
            f'/api/spare-parts/{self.part.pk}/',
            {'selling_price': '30.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.part.refresh_from_db()
        self.assertEqual(self.part.selling_price, Decimal('30.00'))

    def test_create_still_requires_purchase_price(self):
        """
        الإنشاء يبقى يتطلّب purchase_price: حقل النموذج مطلوب وبلا قيمة
        افتراضية، ولو صار للقراءة فقط عند الإنشاء أيضاً لانكسر إنشاء القطع.
        """
        client = self.client_for(self.manager)
        response = client.post('/api/spare-parts/', {
            'name': 'قطعة بلا تكلفة',
            'part_number': 'NP-1',
            'category': self.category.pk,
            'selling_price': '20.00',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('purchase_price', response.data)

    def test_create_with_purchase_price_succeeds(self):
        client = self.client_for(self.manager)
        response = client.post('/api/spare-parts/', {
            'name': 'قطعة جديدة',
            'part_number': 'NP-2',
            'category': self.category.pk,
            'purchase_price': '7.50',
            'selling_price': '20.00',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        created = SparePart.objects.get(part_number='NP-2')
        self.assertEqual(created.purchase_price, Decimal('7.50'))

    # ── P2-4: لقطة تكلفة الوحدة في الطلبات الخارجية ───────────────────────

    def test_public_order_records_cost_price_snapshot(self):
        """
        ربح قناة المتجر يحتاج تكلفة محفوظة وقت الطلب، مثل InvoiceItem.
        بدونها تظهر مبيعات المتجر إيراداً بلا تكلفة.
        """
        client = APIClient()
        response = client.post('/api/public-orders/', {
            'customer_name': 'زائر', 'phone_number': '0999',
            'items': [{'spare_part': self.part.pk, 'quantity': 3}],
        }, format='json')
        self.assertEqual(response.status_code, 201)

        item = PublicOrderItem.objects.get()
        self.assertEqual(item.cost_price, Decimal('10.00'))
        self.assertEqual(item.unit_price, Decimal('25.00'))
        # الهامش المحفوظ في اللقطة: (25 - 10) * 3
        profit = (item.unit_price - item.cost_price) * item.quantity
        self.assertEqual(profit, Decimal('45.00'))

    def test_cost_price_is_not_exposed_to_public_api(self):
        """حقل التكلفة داخلي — لا يجوز أن يظهر في ردّ الواجهة العامة."""
        client = APIClient()
        response = client.post('/api/public-orders/', {
            'customer_name': 'زائر', 'phone_number': '0999',
            'items': [{'spare_part': self.part.pk, 'quantity': 1}],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertNotIn('cost_price', response.data['items'][0])

    # ── P2-5: حماية السجل التدقيقي من الحذف ───────────────────────────────

    def test_cannot_delete_part_with_stock_movements(self):
        """
        حذف قطعة لها حركات مخزون يُرفض بـ400 ورسالة عربية — لا خطأ 500.

        كان StockMovement.spare_part بـCASCADE، فحذف القطعة يمحو تاريخها
        التدقيقي بالكامل (توريد، بيع، تسويات) — وهو بالضبط ما وُجد السجل له.
        """
        services.create_invoice(
            cashier=self.manager,
            items=[{'spare_part': self.part, 'quantity': 1}],
        )
        client = self.client_for(self.manager)
        response = client.delete(f'/api/spare-parts/{self.part.pk}/')

        self.assertEqual(response.status_code, 400)
        self.assertIn('detail', response.data)
        self.assertTrue(SparePart.objects.filter(pk=self.part.pk).exists())
        self.assertTrue(StockMovement.objects.filter(spare_part=self.part).exists())

    def test_cannot_delete_part_with_invoice_items(self):
        """حماية الفواتير تعمل مستقلةً عن حماية سجل الحركات."""
        services.create_invoice(
            cashier=self.manager,
            items=[{'spare_part': self.part, 'quantity': 1}],
        )
        StockMovement.objects.all().delete()

        client = self.client_for(self.manager)
        response = client.delete(f'/api/spare-parts/{self.part.pk}/')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(SparePart.objects.filter(pk=self.part.pk).exists())

    def test_cannot_delete_category_that_has_parts(self):
        client = self.client_for(self.manager)
        response = client.delete(f'/api/categories/{self.category.pk}/')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Category.objects.filter(pk=self.category.pk).exists())

    def test_part_without_any_history_can_be_deleted(self):
        """الحماية ليست مطلقة: قطعة بلا فواتير ولا حركات تُحذف فعلاً."""
        fresh = SparePart.objects.create(
            name='قطعة بلا تاريخ',
            part_number='FRESH-1',
            category=self.category,
            purchase_price=Decimal('1.00'),
            selling_price=Decimal('2.00'),
            stock_quantity=0,
        )
        client = self.client_for(self.manager)
        response = client.delete(f'/api/spare-parts/{fresh.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SparePart.objects.filter(pk=fresh.pk).exists())

    # ── P1-8: التحذير المبكر من نقص المخزون ───────────────────────────────

    def test_public_order_reports_stock_warnings_when_insufficient(self):
        """
        الطلب يُقبل دائماً (pending بلا خصم) لكن تُرفق قائمة تحذيرية بالبنود
        غير الكافية — ليعرف العميل مبكراً بدل أن يتّصل المشرف لاحقاً.
        """
        client = APIClient()
        response = client.post('/api/public-orders/', {
            'customer_name': 'زائر', 'phone_number': '0999',
            'items': [{'spare_part': self.part.pk, 'quantity': 999}],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertIn('stock_warnings', response.data)
        warning = response.data['stock_warnings'][0]
        self.assertEqual(warning['part'], 'فلتر زيت')
        self.assertEqual(warning['requested'], 999)
        self.assertEqual(warning['available'], 50)
        # الطلب أُنشئ فعلاً ولم يُمنع (قرار تصميمي محفوظ).
        self.assertEqual(PublicOrder.objects.count(), 1)

    def test_public_order_has_no_warnings_when_stock_sufficient(self):
        client = APIClient()
        response = client.post('/api/public-orders/', {
            'customer_name': 'زائر', 'phone_number': '0999',
            'items': [{'spare_part': self.part.pk, 'quantity': 2}],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertNotIn('stock_warnings', response.data)


class StockSafetyRegressionTests(BaseAPITestCase):
    """
    دفعة السلامة A من مراجعة 2026-10-07: تكرار الصنف في الفاتورة (P0-01)،
    مسارات لوحة الإدارة (P0-02)، عكس قيمة التوريد (P0-03)، حماية تاريخ
    المورد (P0-04)، مفتاح إعادة المحاولة (P0-05)، CSRF (P1-01)، والعملة
    الواحدة (P1-06).
    """

    def admin_request(self):
        """طلب إدارة بمستخدم superuser مع مخزن رسائل (تحتاجه إجراءات اللوحة)."""
        from django.contrib.messages.storage.fallback import FallbackStorage
        from django.test import RequestFactory

        admin_user = User.objects.create_superuser(
            username='root', password=PASSWORD, role='manager'
        )
        request = RequestFactory().post('/admin/')
        request.user = admin_user
        request.session = {}
        request._messages = FallbackStorage(request)
        return request

    def model_admin(self, model):
        from django.contrib import admin
        return admin.site._registry[model]

    def make_deal(self, quantity=50, price='20.00', part=None):
        return services.create_supply_deal(
            supplier=self.supplier, spare_part=part or self.part,
            quantity_added=quantity, purchase_price=Decimal(price), user=self.manager,
        )

    # ── P0-01: تكرار الصنف داخل الفاتورة ─────────────────────────────────

    def test_duplicate_lines_exceeding_stock_are_rejected(self):
        client = self.client_for(self.employee)
        response = client.post('/api/invoices/', {'items': [
            {'spare_part': self.part.pk, 'quantity': 30},
            {'spare_part': self.part.pk, 'quantity': 30},
        ]}, format='json')

        self.assertEqual(response.status_code, 400)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_duplicate_lines_within_stock_deduct_their_total(self):
        client = self.client_for(self.employee)
        response = client.post('/api/invoices/', {'items': [
            {'spare_part': self.part.pk, 'quantity': 20},
            {'spare_part': self.part.pk, 'quantity': 20},
        ]}, format='json')

        self.assertEqual(response.status_code, 201)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 10)
        changes = list(StockMovement.objects.order_by('pk').values_list('change', 'quantity_after'))
        self.assertEqual(changes, [(-20, 30), (-20, 10)])
        self.assertEqual(InvoiceItem.objects.count(), 2)

    def test_order_confirmation_checks_total_per_part(self):
        order = PublicOrder.objects.create(customer_name='زائر', phone_number='0999')
        for _ in range(2):
            PublicOrderItem.objects.create(
                order=order, spare_part=self.part, quantity=30, unit_price=Decimal('25.00'),
            )

        with self.assertRaises(services.InventoryError):
            services.confirm_public_order(order, user=self.manager)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(StockMovement.objects.count(), 0)

    # ── P0-02: لوحة الإدارة لا تتجاوز خدمات المخزون ─────────────────────

    def test_admin_part_form_cannot_edit_stock_or_cost(self):
        request = self.admin_request()
        part_admin = self.model_admin(SparePart)
        self.assertIn('stock_quantity', part_admin.get_readonly_fields(request, None))
        self.assertNotIn('purchase_price', part_admin.get_readonly_fields(request, None))
        change_fields = part_admin.get_readonly_fields(request, self.part)
        self.assertIn('stock_quantity', change_fields)
        self.assertIn('purchase_price', change_fields)

    def test_admin_part_save_records_stock_change_as_movement(self):
        request = self.admin_request()
        self.part.stock_quantity = 60
        self.part.purchase_price = Decimal('999.00')
        self.model_admin(SparePart).save_model(request, self.part, None, change=True)

        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 60)
        self.assertEqual(self.part.purchase_price, Decimal('10.00'))
        movement = StockMovement.objects.get()
        self.assertEqual(movement.change, 10)
        self.assertEqual(movement.reason, StockMovement.Reason.ADJUSTMENT)
        self.assertEqual(movement.created_by, request.user)

    def test_admin_cannot_create_financial_documents_directly(self):
        request = self.admin_request()
        for model in (Invoice, SupplyDeal, PublicOrder):
            self.assertFalse(self.model_admin(model).has_add_permission(request), model)
        self.assertNotIn('delete_selected', self.model_admin(SupplyDeal).get_actions(request))

    def test_admin_supply_deal_deletion_reverses_through_service(self):
        deal = self.make_deal()
        self.model_admin(SupplyDeal).delete_model(self.admin_request(), deal)

        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(self.part.purchase_price, Decimal('10.00'))
        self.assertTrue(StockMovement.objects.filter(
            reason=StockMovement.Reason.RESTOCK_REVERSAL, change=-50,
        ).exists())

    def test_admin_order_status_changes_only_through_actions(self):
        request = self.admin_request()
        order_admin = self.model_admin(PublicOrder)
        self.assertIn('status', order_admin.get_readonly_fields(request, None))

        order = PublicOrder.objects.create(customer_name='زائر', phone_number='0999')
        PublicOrderItem.objects.create(
            order=order, spare_part=self.part, quantity=3, unit_price=Decimal('25.00'),
        )
        order_admin.confirm_orders(request, PublicOrder.objects.filter(pk=order.pk))

        order.refresh_from_db()
        self.part.refresh_from_db()
        self.assertEqual(order.status, PublicOrder.Status.CONFIRMED)
        self.assertEqual(self.part.stock_quantity, 47)

    # ── P0-03: عكس التوريد يعكس القيمة مع الكمية ────────────────────────

    def test_supply_reversal_restores_quantity_and_cost(self):
        deal = self.make_deal(quantity=50, price='20.00')
        self.part.refresh_from_db()
        self.assertEqual(self.part.purchase_price, Decimal('15.00'))

        services.delete_supply_deal(deal, user=self.manager)

        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)
        self.assertEqual(self.part.purchase_price, Decimal('10.00'))
        reversal = StockMovement.objects.get(reason=StockMovement.Reason.RESTOCK_REVERSAL)
        self.assertEqual(reversal.unit_cost, Decimal('20.00'))
        # حركة الإضافة الأصلية تبقى في السجل.
        self.assertTrue(StockMovement.objects.filter(reason=StockMovement.Reason.RESTOCK).exists())

    def test_supply_reversal_restores_exact_cost_despite_rounding(self):
        part = SparePart.objects.create(
            name='حساس', part_number='SN-1', category=self.category,
            purchase_price=Decimal('10.00'), selling_price=Decimal('20.00'), stock_quantity=3,
        )
        deal = self.make_deal(quantity=3, price='10.01', part=part)
        services.delete_supply_deal(deal, user=self.manager)
        part.refresh_from_db()
        self.assertEqual(part.purchase_price, Decimal('10.00'))

    def test_supply_reversal_is_refused_after_a_later_sale(self):
        deal = self.make_deal(quantity=50, price='20.00')
        services.create_invoice(cashier=self.employee, items=[{'spare_part': self.part, 'quantity': 5}])

        client = self.client_for(self.manager)
        response = client.delete(f'/api/supply-deals/{deal.pk}/')

        self.assertEqual(response.status_code, 400)
        self.assertTrue(SupplyDeal.objects.filter(pk=deal.pk).exists())
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 95)
        self.assertEqual(self.part.purchase_price, Decimal('15.00'))

    # ── P0-04: حذف المورد لا يمحو تاريخ التوريد ─────────────────────────

    def test_supplier_with_supply_history_cannot_be_deleted(self):
        deal = self.make_deal(quantity=2, price='10.00')
        response = self.client_for(self.manager).delete(f'/api/suppliers/{self.supplier.pk}/')

        self.assertEqual(response.status_code, 400)
        self.assertTrue(SupplyDeal.objects.filter(pk=deal.pk).exists())
        self.assertTrue(Supplier.objects.filter(pk=self.supplier.pk).exists())

    def test_supplier_without_history_can_still_be_deleted(self):
        spare = Supplier.objects.create(company_name='مورد بلا تعاملات', phone_number='0111')
        response = self.client_for(self.manager).delete(f'/api/suppliers/{spare.pk}/')
        self.assertEqual(response.status_code, 204)

    # ── P0-05: مفتاح إعادة المحاولة ─────────────────────────────────────

    def post_invoice(self, client, quantity=1, key='sale-0001'):
        return client.post(
            '/api/invoices/',
            {'items': [{'spare_part': self.part.pk, 'quantity': quantity}]},
            format='json',
            HTTP_IDEMPOTENCY_KEY=key,
        )

    def test_retry_with_same_key_returns_original_invoice(self):
        client = self.client_for(self.employee)
        first = self.post_invoice(client)
        second = self.post_invoice(client)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second['Idempotent-Replayed'], 'true')
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(Invoice.objects.count(), 1)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 49)

    def test_same_key_with_different_content_is_rejected(self):
        client = self.client_for(self.employee)
        self.post_invoice(client, quantity=1)
        response = self.post_invoice(client, quantity=2)

        self.assertEqual(response.status_code, 422)
        self.assertEqual(Invoice.objects.count(), 1)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 49)

    def test_failed_sale_does_not_consume_its_key(self):
        client = self.client_for(self.employee)
        self.assertEqual(self.post_invoice(client, quantity=999).status_code, 400)
        self.assertEqual(self.post_invoice(client, quantity=1).status_code, 201)

    def test_keys_are_scoped_per_cashier(self):
        self.post_invoice(self.client_for(self.employee))
        response = self.post_invoice(self.client_for(self.supervisor))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Invoice.objects.count(), 2)

    def test_malformed_key_is_rejected(self):
        response = self.post_invoice(self.client_for(self.employee), key='x' * 65)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Invoice.objects.count(), 0)

    # ── P1-01: CSRF على الكتابة بكوكيز المصادقة ─────────────────────────

    def csrf_client(self):
        """عميل يفرض CSRF كالمتصفح، مسجّل الدخول عبر الكوكيز، مع رمزه."""
        client = APIClient(enforce_csrf_checks=True)
        token = client.get('/api/auth/csrf/').data['csrfToken']
        response = client.post(
            '/api/auth/login/',
            {'username': 'manager1', 'password': PASSWORD},
            format='json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)
        return client, token

    def test_csrf_endpoint_sets_cookie(self):
        response = APIClient().get('/api/auth/csrf/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('csrftoken', response.cookies)
        self.assertTrue(response.data['csrfToken'])

    def test_login_without_csrf_token_is_rejected(self):
        client = APIClient(enforce_csrf_checks=True)
        client.get('/api/auth/csrf/')
        response = client.post(
            '/api/auth/login/',
            {'username': 'manager1', 'password': PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_cookie_write_requires_csrf_token(self):
        client, token = self.csrf_client()
        url = f'/api/spare-parts/{self.part.pk}/adjust-stock/'

        rejected = client.post(url, {'stock_quantity': 2}, format='json')
        self.assertEqual(rejected.status_code, 403)
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 50)

        accepted = client.post(url, {'stock_quantity': 2}, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(accepted.status_code, 200)

    def test_cookie_reads_do_not_need_csrf_token(self):
        client, _ = self.csrf_client()
        self.assertEqual(client.get('/api/auth/me/').status_code, 200)

    # ── P1-06: عملة المؤسسة الواحدة ─────────────────────────────────────

    def test_invoice_in_another_currency_is_rejected(self):
        response = self.client_for(self.employee).post('/api/invoices/', {
            'items': [{'spare_part': self.part.pk, 'quantity': 1}],
            'currency': 'USD',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Invoice.objects.count(), 0)
        with self.assertRaises(services.InventoryError):
            services.create_invoice(
                cashier=self.employee, currency='USD',
                items=[{'spare_part': self.part, 'quantity': 1}],
            )

    def test_reports_exclude_legacy_other_currency_invoices(self):
        services.create_invoice(cashier=self.employee, items=[{'spare_part': self.part, 'quantity': 1}])
        Invoice.objects.create(cashier=self.employee, total_amount=Decimal('100.00'), currency='USD')

        client = self.client_for(self.manager)
        overall = client.get('/api/reports/sales/').data['overall']
        self.assertEqual(overall['currency'], 'SDG')
        self.assertEqual(overall['total_revenue'], 25.0)
        self.assertEqual(overall['other_currency_orders'], 1)
        stats = client.get('/api/dashboard/stats/').data
        self.assertEqual(stats['total_revenue'], 25.0)
