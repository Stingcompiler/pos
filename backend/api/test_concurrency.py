"""
اختبارات التزامن الحقيقي: اتصالان مستقلان بقاعدة البيانات في الوقت نفسه.

تحتاج PostgreSQL (أقفال صفوف حقيقية واتصالات متوازية)، فتُتخطّى على SQLite.
تشغيلها: ضبط DB_NAME على قاعدة PostgreSQL للاختبار ثم `manage.py test api`.
"""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from unittest import skipUnless

from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase

from api import services
from api.models import Category, CustomUser, Invoice, SparePart, StockMovement


@skipUnless(connection.vendor == 'postgresql', 'يحتاج PostgreSQL لاتصالات متوازية حقيقية')
class ConcurrentSaleTests(TransactionTestCase):

    def setUp(self):
        self.cashier = CustomUser.objects.create_user(
            username='concurrent_cashier', password='StrongPass123', role='employee'
        )
        category = Category.objects.create(name='تزامن')
        self.part = SparePart.objects.create(
            name='آخر قطعة', part_number='PG-1', category=category,
            purchase_price=Decimal('10.00'), selling_price=Decimal('20.00'), stock_quantity=1,
        )

    def run_together(self, *calls):
        """تشغيل الدوال معاً بعد حاجز، كل منها باتصال قاعدة بيانات مستقل."""
        barrier = Barrier(len(calls))

        def run(call):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                try:
                    return call()
                except services.InventoryError:
                    return 'rejected'
            finally:
                connections['default'].close()

        with ThreadPoolExecutor(max_workers=len(calls)) as pool:
            return list(pool.map(run, calls))

    def sell(self, quantity=1, key=None):
        return lambda: services.create_invoice(
            cashier=CustomUser.objects.get(pk=self.cashier.pk),
            items=[{'spare_part': self.part.pk, 'quantity': quantity}],
            idempotency_key=key,
        )

    def test_two_sales_of_the_last_unit_sell_it_once(self):
        outcomes = self.run_together(self.sell(), self.sell())

        self.assertEqual(sorted(o if o == 'rejected' else 'sold' for o in outcomes), ['rejected', 'sold'])
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 0)
        self.assertEqual(Invoice.objects.count(), 1)

    def test_concurrent_retries_with_one_key_return_the_same_invoice(self):
        """
        الرد الأول ضاع فأُعيد الطلب بالمفتاح نفسه بينما الأول ما زال يُنفَّذ:
        يجب أن تعود الفاتورة نفسها للطرفين، لا رفض «نفاد الرصيد» للثاني.
        """
        outcomes = self.run_together(self.sell(key='retry-1'), self.sell(key='retry-1'))

        self.assertNotIn('rejected', outcomes)
        self.assertEqual(outcomes[0].pk, outcomes[1].pk)
        self.assertEqual(sorted(o.idempotent_replay for o in outcomes), [False, True])
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 0)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_concurrent_sales_with_duplicate_lines_cannot_oversell(self):
        """رصيد 10 وعمليتان متزامنتان كل منهما بندان من 3: تنجح واحدة فقط."""
        SparePart.objects.filter(pk=self.part.pk).update(stock_quantity=10)

        def sale():
            return services.create_invoice(
                cashier=CustomUser.objects.get(pk=self.cashier.pk),
                items=[
                    {'spare_part': self.part.pk, 'quantity': 3},
                    {'spare_part': self.part.pk, 'quantity': 3},
                ],
            )

        outcomes = self.run_together(sale, sale)

        self.assertEqual(sorted(o if o == 'rejected' else 'sold' for o in outcomes), ['rejected', 'sold'])
        self.part.refresh_from_db()
        self.assertEqual(self.part.stock_quantity, 4)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(sum(StockMovement.objects.values_list('change', flat=True)), -6)
