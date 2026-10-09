from django.test import TransactionTestCase, override_settings
from django.core import mail
from rest_framework.test import APIClient
from api.models import Category, SparePart


class NotificationChecks(TransactionTestCase):
    @override_settings(ADMIN_NOTIFICATION_EMAIL='audit@example.invalid', DASHBOARD_BASE_URL='http://localhost:5180', DEFAULT_FROM_EMAIL='audit@example.invalid')
    def test_order_email_includes_created_items(self):
        cat = Category.objects.create(name='Audit notification')
        part = SparePart.objects.create(name='EMAIL-PART-SENTINEL', part_number='EMAIL-001', category=cat, purchase_price=10, selling_price=20, stock_quantity=10)
        result = APIClient().post('/api/public-orders/', {'customer_name':'Audit customer','phone_number':'000','items':[{'spare_part':part.pk,'quantity':2}]}, format='json')
        self.assertEqual(result.status_code, 201)
        print(f'EVIDENCE order notification: mail_count={len(mail.outbox)}, contains_item={bool(mail.outbox and "EMAIL-PART-SENTINEL" in mail.outbox[0].body)}')
        self.assertIn('EMAIL-PART-SENTINEL', mail.outbox[0].body)

