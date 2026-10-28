# WindScope frontend

React, TypeScript and Vite dashboard. The root [README](../README.md) covers the
complete application, data methodology and Docker setup.

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite forwards `/api` requests to the
backend on port 8000. Start that backend locally or with Docker Compose from the
repository root. For a separate API host, set `VITE_API_BASE_URL` before building.

```sh
npm run test
npm run lint
npm run build
```

- `src/pages/`: overview, daily forecast explorer, accuracy and data quality.
- `src/components/`: reusable panels, metrics, states and lazy-loaded ECharts.
- `src/services/api.ts`: Zod-validated API contracts and abortable requests.
- `src/styles/theme.css`: all UI and chart color tokens, including dark mode.
- `src/test/`: deterministic fixtures and test environment setup.

Filters live in the URL. Reports use a shared backend snapshot; no business
metrics are recalculated in the frontend. Missing values stay missing in charts,
tables and CSV exports. The interface explicitly labels historical actuals,
cutoff assumptions and the hourly comparison policy.
