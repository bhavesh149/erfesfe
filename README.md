# WindScope

Historical Elexon wind forecast analysis for UK day-ahead purchasing decisions in
January 2026. React/TypeScript dashboard with a Python/FastAPI ingestion and
analytics backend. Includes overview, forecast explorer, accuracy and data-quality
views. Public deployment and submission deliverables remain pending.

![WindScope dashboard](docs/dashboard.png)

UI previews: [filter dialog](docs/filters.png) · [mobile navigation](docs/mobile-navigation.png).

## Architecture

![WindScope application architecture](docs/architecture.png)

[Editable SVG](docs/architecture.svg). The ingestion CLI runs explicitly using the
backend image; it is not a separate continuously running Compose service.

## Cloud deployment

Deployment configuration is included for **Vercel (frontend), Render Free (API),
and Neon Free (PostgreSQL)**. Follow the short [deployment guide](docs/deployment.md)
for Git push, data import, environment variables, and public access checks.
Public deployment is still pending. Free hosting can sleep and has usage limits.

## Structure

- `backend/app/services/`: Elexon client and auditable, idempotent ingestion.
- `backend/app/analytics/`: publication cutoff selection, matching and metrics.
- `backend/app/core/`, `schemas/`: database/configuration and validated contracts.
- `backend/app/main.py`, `cli.py`: read-only HTTP API and explicit backfill/report jobs.
- `backend/migrations/`, `tests/`: Alembic migrations and domain/integration tests.
- `frontend/src/styles/`: global UI/chart theme tokens and chart color adapter.
- `frontend/src/pages/`, `components/`: responsive dashboard views and shared UI/charts.
- `frontend/src/services/`: validated API contracts and request handling.
- `frontend/src/test/`: deterministic frontend fixtures and test setup.
- `data/fixtures/`: small deterministic real-data sample. Full archives/reports are ignored.
- `docs/data-validation.md`: source semantics, measured coverage and limitations.
- `docs/deployment.md`, `frontend/vercel.json`, `render.yaml`: cloud deployment setup.
- `compose.yaml`, `.github/workflows/`: backend/PostgreSQL containers and CI.
- `project.md`, `TASKS.md`: original roadmap and current task checklist.

## Local backend

Python 3.12. Run from `backend/`; the default database is a local SQLite file.
Use PostgreSQL through `DATABASE_URL` for deployment.

```sh
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python -m app.cli backfill --dataset WINDFOR --from 2025-12-29 --to 2026-02-01 --save-dir ../data/raw
python -m app.cli backfill --dataset FUELHH --from 2026-01-01 --to 2026-02-04 --save-dir ../data/raw
uvicorn app.main:app --reload --port 8000
```

`--from` and `--to` are UTC **publication dates**, with an exclusive upper bound.
Each job commits one day atomically, records failures, and is safe to rerun.
Use `--archive-dir ../data/raw` instead of `--save-dir` to replay downloaded files.
Empty imports remain visible in metadata. An interrupted job may remain `running`;
rerun its window to complete it. Dashboard requests never call Elexon.

API documentation: [local Swagger UI](http://localhost:8000/docs).
Routes: `/api/v1/health`, `/overview`, `/accuracy`, `/generation`, `/metadata`
(all under `/api/v1`). Overview/accuracy accept `month=2026-01`,
`basis=decision|delivery`, `cutoff=10:00` and an optional aware `snapshot` timestamp.
Generation accepts a delivery `date` from 1 January through 1 February 2026.
Health checks database/schema readiness; it does not assert data completeness.

## Reports and methodology

```sh
python -m app.cli report --basis decision --cutoff 10:00 --output ../data/reports/january-decisions.json
python -m app.cli report --basis delivery --output ../data/reports/january-deliveries.json
```

To replay a report, pass its `snapshot_at` with `--snapshot`. Immutable raw payload
hashes and a source fingerprint identify the data used. Forecasts use the latest
publication at or before the previous-day UK cutoff; actuals are retrospective.
Same-publication conflicting values are excluded. Missing pairs produce null
metrics rather than fabricated zeros. Errors are `forecast − actual`; MAE, RMSE
and bias are calculated in MW, with explicit matched sample counts.

**Resolution:** hourly forecasts match actuals at identical start timestamps.
No hourly averaging or half-hour interpolation is assumed. See
[validation findings](docs/data-validation.md) for measured coverage and caveats.

## Full application with Docker

From the repository root, with Docker running:

```sh
cp .env.example .env
# Set a URL-safe local POSTGRES_PASSWORD in .env.
docker compose up --build -d
docker compose exec api python -m app.cli backfill --dataset WINDFOR --from 2025-12-29 --to 2026-02-01
docker compose exec api python -m app.cli backfill --dataset FUELHH --from 2026-01-01 --to 2026-02-04
docker compose down
```

Open [the Docker dashboard](http://localhost:8080) and
[API documentation](http://localhost:8080/docs). PostgreSQL uses a named volume;
stopping containers preserves data. Migrations run as a separate startup service.
The non-root Nginx frontend serves the React build, supports deep links and proxies
API requests on the same origin. Frontend, API and database have health checks.
The full stack has been built and tested locally with the real January archive.

## Frontend and theme

```sh
cd frontend
npm ci
npm run dev
```

The dev dashboard runs at [localhost:5173](http://localhost:5173). Vite proxies
`/api` to the local API on port 8000, including the Docker API. For separately
hosted frontend/API deployments, set `VITE_API_BASE_URL` to the API origin before
building and configure the backend's `CORS_ORIGINS` accordingly.

Change colors in `frontend/src/styles/theme.css`. Components use semantic CSS
variables; charts use `getChartTheme()` from `chartTheme.ts` and should rebuild
options after a theme change. The theme button cycles through system, light and
dark modes and remembers the selection. All UI/chart colors are global.

On screens up to 900px wide, navigation opens from the hamburger as a modal
drawer. Desktop navigation scrolls independently. “Edit filters” opens a themed
dialog with date-basis cards, a 24-hour time picker, presets and cancel/reset actions;
draft changes only affect the analysis after applying them. Dialogs support keyboard
navigation, Escape and focus restoration.

Filters are reflected in the URL. CSV exports include raw values, publication
times, cutoff, snapshot and source fingerprint. “Copy snapshot link” creates a
reproducible view against the same retained database. Loading, error, empty,
partial-data and failed-refresh states are explicit; missing values remain blank.

## Checks

```sh
cd backend
.venv/bin/pytest -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
# Optional: use a dedicated disposable PostgreSQL test database as well.
TEST_DATABASE_URL=postgresql+psycopg://user:password@localhost/windscope_test .venv/bin/pytest -q
# Read-only checks against a running stack after the January imports:
LIVE_API_URL=http://localhost:8000 .venv/bin/pytest tests/test_live_api.py -q
LIVE_API_URL=http://localhost:8080 .venv/bin/pytest tests/test_live_api.py -q
```

The PostgreSQL test fixture creates and drops application tables in that test
database. CI runs both database implementations, checks migrations and builds the
frontend. Frontend checks: `npm run test`, `npm run lint` and `npm run build` from
`frontend/`. Browser QA covers real-data rendering, theme changes, date navigation
and filter application. Unit/integration tests cover errors, missing/conflicting
data, request validation, export provenance and snapshot behavior.

## Attribution and delivery status

Contains BMRS data © Elexon Limited copyright and database right 2026.
Data source: Elexon Insights Solution, datasets FUELHH (WIND) and WINDFOR.
Source: [Elexon](https://bmrs.elexon.co.uk/), under the
[BMRS data licence](https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/).
Wind forecasts concern operationally metered GB wind; this application does not
calculate a customer's electricity purchase requirement or financial exposure.

AI tools were used: OpenAI Codex assisted with requirements analysis, source
research, implementation and tests. Results were checked against real Elexon
records and deterministic tests.

Public application URL, anonymous public repository, unlisted video and submission
form are pending. No deployment or video is claimed by this stage.
