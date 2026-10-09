# اسبير: صورة واحدة (واجهة React مبنية + Django/Gunicorn).
# البيانات (SQLite والصور والنسخ) في /data: اربطه بمجلد أو volume دائم.

FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SQLITE_PATH=/data/db.sqlite3 \
    DJANGO_MEDIA_ROOT=/data/media \
    DJANGO_PRIVATE_MEDIA_ROOT=/data/private \
    DJANGO_BACKUP_DIR=/data/backups
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN DJANGO_SECRET_KEY=build-only DJANGO_DEBUG=False python manage.py collectstatic --noinput -v0 \
    && useradd --system --uid 10001 --home /data aspir \
    && mkdir -p /data && chown aspir /data
USER aspir
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 3 --access-logfile - --forwarded-allow-ips='*'"]
