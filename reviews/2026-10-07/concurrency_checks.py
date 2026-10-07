"""Prove last-unit locking on PostgreSQL, with independent DB connections."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.test import TransactionTestCase
from django.db import connections, close_old_connections
from api import services
from api.models import CustomUser, Category, SparePart, Invoice


class PostgreSQLConcurrencyChecks(TransactionTestCase):
    def test_two_cashiers_cannot_sell_same_last_unit(self):
        self.assertEqual(connections['default'].vendor, 'postgresql')
        user = CustomUser.objects.create_user(username='concurrency_review', password='AuditOnly123!', role='manager')
        cat = Category.objects.create(name='Audit concurrency')
        part = SparePart.objects.create(name='Last unit', part_number='PG-LAST', category=cat, purchase_price=10, selling_price=20, stock_quantity=1)
        barrier = Barrier(2)

        def sell():
            close_old_connections()
            try:
                cashier = CustomUser.objects.get(pk=user.pk)
                barrier.wait(timeout=10)
                try:
                    services.create_invoice(cashier=cashier, items=[{'spare_part': part.pk, 'quantity': 1}])
                    return 'sold'
                except services.InventoryError:
                    return 'rejected'
            finally:
                connections['default'].close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda _: sell(), range(2)))
        part.refresh_from_db()
        print(f'EVIDENCE PostgreSQL concurrent sale: outcomes={outcomes}, stock={part.stock_quantity}, invoices={Invoice.objects.count()}')
        self.assertCountEqual(outcomes, ['sold', 'rejected'])
        self.assertEqual(part.stock_quantity, 0)
        self.assertEqual(Invoice.objects.count(), 1)
