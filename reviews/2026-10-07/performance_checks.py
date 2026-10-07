"""Local PostgreSQL measurements; not a production load test."""
from statistics import median
from time import perf_counter

from django.test import TestCase
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from api.models import Category, Supplier, SparePart, CustomUser


class PerformanceChecks(TestCase):
    def test_measure_catalog_with_ten_thousand_parts(self):
        category = Category.objects.create(name='Benchmark category')
        supplier = Supplier.objects.create(company_name='Benchmark supplier', phone_number='000')
        user = CustomUser.objects.create_user(username='benchmark', role='manager')
        SparePart.objects.bulk_create([
            SparePart(name=f'Benchmark part {i:05}', part_number=f'BENCH-{i:05}', category=category, supplier=supplier, purchase_price=10, selling_price=20, stock_quantity=10)
            for i in range(10000)
        ], batch_size=500)
        client = APIClient()
        client.force_authenticate(user)
        for url in ['/api/spare-parts/search-pos/?q=BENCH', '/api/spare-parts/', '/api/public/parts/', '/api/reports/sales/']:
            durations = []
            for _ in range(3):
                with CaptureQueriesContext(connection) as queries:
                    started = perf_counter()
                    response = client.get(url)
                    content_size = len(response.content)
                    durations.append(round((perf_counter() - started) * 1000, 2))
                count = len(response.data) if isinstance(response.data, list) else len(response.data.get('results', []))
                query_count = len(queries)
            self.assertEqual(response.status_code, 200)
            print(f'BENCHMARK url={url} median_ms={median(durations)} min_ms={min(durations)} max_ms={max(durations)} queries={query_count} records={count} bytes={content_size}')
        listing = client.get('/api/public/parts/').data
        print(f'EVIDENCE public catalog: database_count={SparePart.objects.count()}, response_count={len(listing)}, pagination_metadata={isinstance(listing, dict)}')

