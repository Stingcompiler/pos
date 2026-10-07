"""
حسابات التقارير المالية بعملة المؤسسة.

الإيراد والربح صافيان من المرتجعات: المرتجع يُحتسب في الفترة التي حدث فيها،
فيقلّ إيرادها وربحها بقيمة ما رُدّ (بسعر البيع وتكلفته الأصليين).
"""

from decimal import Decimal

from django.conf import settings
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum

from .models import Expense, Invoice, InvoiceItem, Payment, SaleReturn, SaleReturnItem

ZERO = Decimal('0')


def profit_expression():
    """ربح سطر (بند فاتورة أو بند مرتجع): (سعر الوحدة - تكلفتها) × الكمية."""
    return ExpressionWrapper(
        (F('unit_price') - F('cost_price')) * F('quantity'),
        output_field=DecimalField(max_digits=16, decimal_places=2),
    )


def _in_range(queryset, field, start, end):
    if start is not None:
        queryset = queryset.filter(**{f'{field}__gte': start})
    if end is not None:
        queryset = queryset.filter(**{f'{field}__lt': end})
    return queryset


def scoped(start=None, end=None) -> dict:
    """استعلامات الفترة: الفواتير وبنودها والمرتجعات وبنودها ودفعات البيع."""
    base = settings.BASE_CURRENCY
    return {
        'invoices': _in_range(Invoice.objects.filter(currency=base), 'created_at', start, end),
        'items': _in_range(
            InvoiceItem.objects.filter(invoice__currency=base), 'invoice__created_at', start, end,
        ),
        'returns': _in_range(
            SaleReturn.objects.filter(invoice__currency=base), 'created_at', start, end,
        ),
        'return_items': _in_range(
            SaleReturnItem.objects.filter(sale_return__invoice__currency=base),
            'sale_return__created_at', start, end,
        ),
        'sale_payments': _in_range(
            Payment.objects.filter(kind=Payment.Kind.SALE, invoice__currency=base),
            'created_at', start, end,
        ),
    }


def period_figures(start=None, end=None) -> dict:
    """إجماليات فترة: الإيراد الإجمالي والمرتجعات والصافي والربح الصافي."""
    q = scoped(start, end)
    invoice_agg = q['invoices'].aggregate(
        gross=Sum('total_amount'), orders=Count('id'), credit=Sum('credit_amount'),
    )
    returns_agg = q['returns'].aggregate(total=Sum('total_amount'), count=Count('id'))
    gross_profit = q['items'].aggregate(v=Sum(profit_expression()))['v'] or ZERO
    returned_profit = q['return_items'].aggregate(v=Sum(profit_expression()))['v'] or ZERO

    gross = invoice_agg['gross'] or ZERO
    returns_total = returns_agg['total'] or ZERO
    return {
        'orders': invoice_agg['orders'] or 0,
        'gross_revenue': gross,
        'returns_total': returns_total,
        'returns_count': returns_agg['count'] or 0,
        'revenue': gross - returns_total,
        'profit': gross_profit - returned_profit,
        'credit_sales': invoice_agg['credit'] or ZERO,
    }


def expenses_total(start_date=None, end_date=None) -> Decimal:
    expenses = Expense.objects.all()
    if start_date is not None:
        expenses = expenses.filter(date__gte=start_date)
    if end_date is not None:
        expenses = expenses.filter(date__lt=end_date)
    return expenses.aggregate(v=Sum('amount'))['v'] or ZERO


def top_products(start=None, end=None, limit=10) -> list:
    """الأكثر مبيعاً بالإيراد الصافي بعد طرح المرتجعات."""
    q = scoped(start, end)
    rows = {}
    # أسماء التجميع (sold_*) لا تطابق أسماء الحقول: تجميع باسم quantity كان
    # يحجب الحقل نفسه داخل تعبير الربح.
    totals = {
        'sold_quantity': Sum('quantity'),
        'sold_revenue': Sum('subtotal'),
        'sold_profit': Sum(profit_expression()),
    }
    for row in q['items'].values('spare_part__id', 'spare_part__name').annotate(**totals):
        rows[row['spare_part__id']] = {
            'id': row['spare_part__id'], 'name': row['spare_part__name'],
            'quantity_sold': row['sold_quantity'] or 0,
            'revenue': row['sold_revenue'] or ZERO, 'profit': row['sold_profit'] or ZERO,
        }
    for row in q['return_items'].values('invoice_item__spare_part_id').annotate(**totals):
        entry = rows.get(row['invoice_item__spare_part_id'])
        if entry is None:
            continue
        entry['quantity_sold'] -= row['sold_quantity'] or 0
        entry['revenue'] -= row['sold_revenue'] or ZERO
        entry['profit'] -= row['sold_profit'] or ZERO
    return sorted(rows.values(), key=lambda entry: entry['revenue'], reverse=True)[:limit]
