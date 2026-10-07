"""
ترويسات إضافية للملفات الثابتة عبر WhiteNoise.

عامل الخدمة (sw.js) مبنيّ تحت /static/ لأن روابط ملفاته المخزّنة نسبية إليه،
بينما صفحات التطبيق عند الجذر. بلا Service-Worker-Allowed يرفض المتصفح نطاقاً
أوسع من مجلد الملف، فلا يعمل التطبيق المثبّت ولا صفحاته دون اتصال.
"""


def add_headers(headers, path, url):
    if url.endswith('/sw.js'):
        headers['Service-Worker-Allowed'] = '/'
        # النسخة الجديدة من عامل الخدمة يجب أن تصل فور النشر.
        headers['Cache-Control'] = 'no-cache'
