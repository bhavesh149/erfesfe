#!/bin/sh
set -eu

# Render's free filesystem is ephemeral: never silently use local SQLite here.
: "${DATABASE_URL:?Set DATABASE_URL to the external PostgreSQL connection string}"
: "${CORS_ORIGINS:?Set CORS_ORIGINS to a JSON array of frontend origins}"
case "$DATABASE_URL" in
  postgresql://*|postgres://*|postgresql+psycopg://*) ;;
  *) echo "Render requires a PostgreSQL DATABASE_URL" >&2; exit 1 ;;
esac

# Free services have no pre-deploy job. Fail startup if migrations fail.
# Historical ingestion remains an explicit local job against the same database.
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1
