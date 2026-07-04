from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from api.models import Category, CarModel, SparePart, Invoice

User = get_user_model()

class POSFeatureTestCase(TestCase):
    def setUp(self):
        # Create standard test data
        self.user = User.objects.create_user(
            username="cashier_test",
            password="testpassword123",
            role="employee"
        )
        self.category = Category.objects.create(name="Engine parts")
        self.car_model_1 = CarModel.objects.create(
            brand="Toyota",
            model_name="Corolla",
            year_start=2015,
            year_end=2020
        )
        self.car_model_2 = CarModel.objects.create(
            brand="Hyundai",
            model_name="Elantra",
            year_start=2016,
            year_end=2021
        )

    def test_spare_part_carmodel_many_to_many(self):
        """Verify that a SparePart can be linked to multiple CarModels."""
        part = SparePart.objects.create(
            name="Spark Plug",
            part_number="SPK-123",
            category=self.category,
            purchase_price="15.00",
            selling_price="25.00",
            stock_quantity=100
        )
        # Add compatibility relations
        part.compatible_cars.add(self.car_model_1, self.car_model_2)
        part.save()

        # Assert association
        self.assertEqual(part.compatible_cars.count(), 2)
        self.assertIn(self.car_model_1, part.compatible_cars.all())
        self.assertIn(self.car_model_2, part.compatible_cars.all())

    def test_invoice_cash_payment_clears_bank_details(self):
        """Verify that cash payment automatically clears/nulls bank transaction fields on clean."""
        invoice = Invoice(
            cashier=self.user,
            total_amount="120.00",
            payment_method="cash",
            bank_name="Bank of Khartoum",
            reference_id="REF123456",
            sender_account_number="2543321"
        )
        # Save triggers clean() which should automatically set these to None
        invoice.save()

        self.assertEqual(invoice.payment_method, "cash")
        self.assertIsNone(invoice.bank_name)
        self.assertIsNone(invoice.reference_id)
        self.assertIsNone(invoice.sender_account_number)

    def test_invoice_bank_payment_requires_bank_details(self):
        """Verify that bank payment validation raises errors if bank details are missing."""
        invoice = Invoice(
            cashier=self.user,
            total_amount="250.00",
            payment_method="bank",
            bank_name="",
            reference_id="",
            sender_account_number=""
        )

        with self.assertRaises(ValidationError) as ctx:
            invoice.save()

        self.assertIn("bank_name", ctx.exception.message_dict)
        self.assertIn("reference_id", ctx.exception.message_dict)
        self.assertIn("sender_account_number", ctx.exception.message_dict)

    def test_invoice_bank_payment_succeeds_with_complete_details(self):
        """Verify that bank payment validates and saves successfully if all details are provided."""
        invoice = Invoice(
            cashier=self.user,
            total_amount="450.00",
            payment_method="bank",
            bank_name="Faisal Islamic Bank",
            reference_id="TXN987654",
            sender_account_number="1203040"
        )
        # Should not raise validation error
        invoice.save()

        self.assertEqual(invoice.payment_method, "bank")
        self.assertEqual(invoice.bank_name, "Faisal Islamic Bank")
        self.assertEqual(invoice.reference_id, "TXN987654")
        self.assertEqual(invoice.sender_account_number, "1203040")

    def test_site_setting_singleton_behavior(self):
        """Verify that SiteSetting behaves as a singleton (only one row exists)."""
        from api.models import SiteSetting
        setting1 = SiteSetting.objects.create(site_name="Brand A")
        setting2 = SiteSetting.objects.create(site_name="Brand B")

        # Both setting1 and setting2 should save to pk=1, updating the same database row
        self.assertEqual(setting1.pk, 1)
        self.assertEqual(setting2.pk, 1)
        self.assertEqual(SiteSetting.objects.count(), 1)
        self.assertEqual(SiteSetting.objects.get(pk=1).site_name, "Brand B")

    def test_public_featured_parts_filtering(self):
        """Verify that public featured parts API filters correctly and returns only featured items."""
        from api.models import SparePart
        part_featured = SparePart.objects.create(
            name="Featured Radiator",
            part_number="RAD-999",
            category=self.category,
            purchase_price="150.00",
            selling_price="220.00",
            stock_quantity=10,
            is_featured=True
        )
        part_normal = SparePart.objects.create(
            name="Normal Belt",
            part_number="BLT-111",
            category=self.category,
            purchase_price="10.00",
            selling_price="18.00",
            stock_quantity=50,
            is_featured=False
        )

        # Call public API using the test client
        response = self.client.get('/api/public/featured-parts/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], "Featured Radiator")

    def test_public_contact_submission_success(self):
        """Verify that public contact submission API correctly validates and saves contact message logs."""
        from api.models import ContactMessage
        payload = {
            "name": "Musab Al Sting",
            "email": "musab@example.com",
            "phone": "+249912345678",
            "message": "Hi, I need a replacement oil filter for a Corolla 2018."
        }

        response = self.client.post('/api/public/contact/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ContactMessage.objects.count(), 1)
        msg = ContactMessage.objects.first()
        self.assertEqual(msg.name, "Musab Al Sting")
        self.assertEqual(msg.email, "musab@example.com")
        self.assertEqual(msg.message, payload["message"])

    def test_public_order_creation_success(self):
        """Verify that visitors can place a public order with order items."""
        from api.models import PublicOrder, PublicOrderItem
        part = SparePart.objects.create(
            name="Air Filter",
            part_number="ARF-101",
            category=self.category,
            purchase_price="10.00",
            selling_price="15.00",
            stock_quantity=50
        )
        payload = {
            "customer_name": "Al Sting Tester",
            "phone_number": "12345678",
            "email": "sting@test.com",
            "location": "Khartoum, Riyadh",
            "items": [
                {
                    "spare_part": part.id,
                    "quantity": 2
                }
            ]
        }
        import json
        response = self.client.post(
            '/api/public-orders/',
            json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(PublicOrder.objects.count(), 1)
        order = PublicOrder.objects.first()
        self.assertEqual(order.customer_name, "Al Sting Tester")
        self.assertEqual(order.location, "Khartoum, Riyadh")
        self.assertEqual(order.total_amount, 30.00)
        self.assertEqual(PublicOrderItem.objects.count(), 1)
        item = PublicOrderItem.objects.first()
        self.assertEqual(item.quantity, 2)
        self.assertEqual(item.unit_price, 15.00)

    def test_public_order_stock_deduction_on_confirm(self):
        """Verify that confirming a pending public order deducts stock quantity from SparePart."""
        from api.models import PublicOrder, PublicOrderItem
        part = SparePart.objects.create(
            name="Air Filter",
            part_number="ARF-101",
            category=self.category,
            purchase_price="10.00",
            selling_price="15.00",
            stock_quantity=50
        )
        order = PublicOrder.objects.create(
            customer_name="Al Sting Tester",
            phone_number="12345678",
            total_amount=30.00,
            status="pending"
        )
        item = PublicOrderItem.objects.create(
            order=order,
            spare_part=part,
            quantity=2,
            unit_price=15.00
        )

        # Before confirm, stock is still 50
        part.refresh_from_db()
        self.assertEqual(part.stock_quantity, 50)

        # Confirm status transitions
        order.status = "confirmed"
        order.save()

        # After confirm, stock is 48
        part.refresh_from_db()
        self.assertEqual(part.stock_quantity, 48)

    def test_public_order_insufficient_stock_error(self):
        """Verify that confirming an order with insufficient stock raises ValidationError."""
        from api.models import PublicOrder, PublicOrderItem
        part = SparePart.objects.create(
            name="Air Filter",
            part_number="ARF-101",
            category=self.category,
            purchase_price="10.00",
            selling_price="15.00",
            stock_quantity=1
        )
        order = PublicOrder.objects.create(
            customer_name="Al Sting Tester",
            phone_number="12345678",
            total_amount=30.00,
            status="pending"
        )
        item = PublicOrderItem.objects.create(
            order=order,
            spare_part=part,
            quantity=2,
            unit_price=15.00
        )

        order.status = "confirmed"
        with self.assertRaises(ValidationError):
            order.save()

