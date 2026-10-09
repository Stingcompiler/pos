"""Business invariants for this audit; failures are findings, not fixes.

Run from backend with the review directory on PYTHONPATH:
DJANGO_SETTINGS_MODULE=review_settings .venv/bin/python -m django test review_checks -v 2
"""
from decimal import Decimal
from unittest.mock import patch
from datetime import datetime, timezone as dt_timezone

from django.test import TestCase, RequestFactory
from django.contrib import admin
from django.db.models import Sum
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api import services
from api.models import CustomUser, Category, SparePart, Supplier, SupplyDeal, Invoice, StockMovement


class ReviewChecks(TestCase):
    def setUp(self):
        self.manager = CustomUser.objects.create_user(username='audit_manager', password='AuditOnly123!', role='manager', is_staff=True, is_superuser=True)
        self.employee = CustomUser.objects.create_user(username='audit_employee', password='AuditOnly123!', role='employee')
        self.category = Category.objects.create(name='Audit filters')
        self.supplier = Supplier.objects.create(company_name='Audit supplier', phone_number='0000000000')
        self.part = SparePart.objects.create(name='Audit filter', part_number='AUDIT-001', category=self.category, supplier=self.supplier, purchase_price=Decimal('10'), selling_price=Decimal('20'), stock_quantity=10)
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def test_01_duplicate_lines_cannot_sell_more_than_stock(self):
        result = self.client.post('/api/invoices/', {'items': [{'spare_part': self.part.pk, 'quantity': 6}, {'spare_part': self.part.pk, 'quantity': 6}]}, format='json')
        self.part.refresh_from_db()
        print(f'EVIDENCE duplicate lines: status={result.status_code}, stock={self.part.stock_quantity}, sold={sum(Invoice.objects.values_list("items__quantity", flat=True)) if Invoice.objects.exists() else 0}, movement_sum={StockMovement.objects.aggregate(v=Sum("change"))["v"]}')
        self.assertEqual(result.status_code, 400, '12 units requested from stock of 10 must be rejected')

    def test_02_employee_cannot_read_purchase_cost(self):
        self.client.force_authenticate(self.employee)
        result = self.client.get('/api/spare-parts/')
        row = result.data['results'][0]
        print(f'EVIDENCE employee part fields: purchase_price={row.get("purchase_price")}')
        self.assertNotIn('purchase_price', row)

    def test_03_employee_cannot_read_invoice_profit(self):
        invoice = services.create_invoice(cashier=self.employee, items=[{'spare_part': self.part, 'quantity': 1}])
        self.client.force_authenticate(self.employee)
        result = self.client.get(f'/api/invoices/{invoice.pk}/')
        print(f'EVIDENCE employee invoice cost/profit: {result.data["items"][0].get("cost_price")}/{result.data["items"][0].get("profit")}')
        self.assertNotIn('cost_price', result.data['items'][0])

    def test_04_cookie_write_requires_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        client.cookies['access_token'] = str(RefreshToken.for_user(self.manager).access_token)
        result = client.post(f'/api/spare-parts/{self.part.pk}/adjust-stock/', {'stock_quantity': 2}, format='json', HTTP_ORIGIN='https://untrusted.example')
        self.part.refresh_from_db()
        print(f'EVIDENCE untrusted-origin write without CSRF: status={result.status_code}, stock={self.part.stock_quantity}')
        self.assertEqual(result.status_code, 403)

    def test_05_supply_reversal_restores_cost(self):
        deal = services.create_supply_deal(supplier=self.supplier, spare_part=self.part, quantity_added=10, purchase_price=Decimal('30'), user=self.manager)
        services.delete_supply_deal(deal, user=self.manager)
        self.part.refresh_from_db()
        print(f'EVIDENCE reversed restock: stock={self.part.stock_quantity}, purchase_price={self.part.purchase_price}, expected_cost=10.00')
        self.assertEqual(self.part.purchase_price, Decimal('10'))

    def test_06_supplier_deletion_preserves_supply_history(self):
        deal = services.create_supply_deal(supplier=self.supplier, spare_part=self.part, quantity_added=2, purchase_price=Decimal('10'), user=self.manager)
        result = self.client.delete(f'/api/suppliers/{self.supplier.pk}/')
        self.part.refresh_from_db()
        print(f'EVIDENCE supplier delete: status={result.status_code}, deal_exists={SupplyDeal.objects.filter(pk=deal.pk).exists()}, stock={self.part.stock_quantity}')
        self.assertTrue(SupplyDeal.objects.filter(pk=deal.pk).exists())

    def test_07_same_idempotency_key_does_not_double_sell(self):
        body = {'items': [{'spare_part': self.part.pk, 'quantity': 1}]}
        a = self.client.post('/api/invoices/', body, format='json', HTTP_IDEMPOTENCY_KEY='audit-retry-001')
        b = self.client.post('/api/invoices/', body, format='json', HTTP_IDEMPOTENCY_KEY='audit-retry-001')
        self.part.refresh_from_db()
        print(f'EVIDENCE repeated invoice key: statuses={a.status_code},{b.status_code}, invoices={Invoice.objects.count()}, stock={self.part.stock_quantity}')
        self.assertEqual(Invoice.objects.count(), 1)

    def test_08_mixed_currencies_are_not_summed_as_one(self):
        body = {'items': [{'spare_part': self.part.pk, 'quantity': 1}]}
        for currency in ['SDG', 'USD']:
            self.client.post('/api/invoices/', {**body, 'currency': currency}, format='json')
        report = self.client.get('/api/reports/sales/')
        print(f'EVIDENCE mixed currency report: {report.data["overall"]}')
        self.assertNotEqual(report.data['overall']['total_revenue'], 40.0, '20 SDG + 20 USD cannot be reported as an unlabelled 40')

    def test_09_admin_stock_change_keeps_movement(self):
        request = RequestFactory().post('/admin/api/sparepart/')
        request.user = self.manager
        model_admin = admin.site._registry[SparePart]
        self.part.stock_quantity = 17
        model_admin.save_model(request, self.part, None, change=True)
        self.part.refresh_from_db()
        print(f'EVIDENCE admin stock save: stock={self.part.stock_quantity}, movements={StockMovement.objects.count()}, readonly={model_admin.get_readonly_fields(request, self.part)}')
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_10_admin_supply_deletion_reverses_stock(self):
        deal = services.create_supply_deal(supplier=self.supplier, spare_part=self.part, quantity_added=2, purchase_price=Decimal('10'), user=self.manager)
        request = RequestFactory().post('/admin/api/supplydeal/')
        request.user = self.manager
        admin.site._registry[SupplyDeal].delete_model(request, deal)
        self.part.refresh_from_db()
        print(f'EVIDENCE admin supply deletion: stock={self.part.stock_quantity}, expected=10')
        self.assertEqual(self.part.stock_quantity, 10)

    def test_11_today_uses_local_date(self):
        invoice = services.create_invoice(cashier=self.manager, items=[{'spare_part': self.part, 'quantity': 1}])
        fixed_now = datetime(2026, 10, 6, 23, 30, tzinfo=dt_timezone.utc)
        Invoice.objects.filter(pk=invoice.pk).update(created_at=fixed_now)
        with patch('api.views.timezone.now', return_value=fixed_now):
            stats = self.client.get('/api/dashboard/stats/')
        print(f'EVIDENCE Khartoum 01:30 on Oct 7: today_invoices={stats.data["today_invoices"]}, expected=1')
        self.assertEqual(stats.data['today_invoices'], 1)

    def test_12_confirmation_then_cancellation_is_balanced(self):
        order = self.client.post('/api/public-orders/', {'customer_name': 'Audit customer', 'phone_number': '0000000000', 'items': [{'spare_part': self.part.pk, 'quantity': 2}]}, format='json')
        oid = order.data['id']
        for state in ['confirmed', 'confirmed', 'cancelled', 'cancelled']:
            self.client.patch(f'/api/public-orders/{oid}/', {'status': state}, format='json')
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 10)
        self.assertEqual(StockMovement.objects.aggregate(v=Sum('change'))['v'], 0)

    def test_13_opening_quantity_is_not_silently_ignored(self):
        result = self.client.post('/api/spare-parts/', {'name': 'Opening balance', 'part_number': 'OPENING-001', 'category': self.category.pk, 'purchase_price': '10', 'selling_price': '20', 'stock_quantity': 7}, format='json')
        print(f'EVIDENCE create with quantity 7: status={result.status_code}, returned_stock={result.data.get("stock_quantity")}')
        self.assertTrue(result.status_code == 400 or result.data.get('stock_quantity') == 7)

    def test_14_list_data_contains_edit_form_requirements(self):
        row = self.client.get('/api/spare-parts/').data['results'][0]
        missing = {'category', 'compatible_cars', 'min_stock_alert'} - set(row)
        print(f'EVIDENCE list data missing edit requirements: {sorted(missing)}')
        self.assertFalse(missing)
