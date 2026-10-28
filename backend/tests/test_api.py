from contextlib import asynccontextmanager

import httpx
import pytest

from app.core.config import Settings
from app.main import create_app

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(app):
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client


async def test_api_scope_empty_results_and_health(factory):
    async with client_for(create_app(factory=factory)) as client:
        assert (await client.get("/api/v1/health")).status_code == 200
        response = await client.get("/api/v1/overview")
        assert response.status_code == 200
        result = response.json()
        assert result["delivery_start"].startswith("2026-01-02")
        assert result["delivery_end_exclusive"].startswith("2026-02-02")
        assert result["coverage"]["expected_forecast_points"] == 744
        assert result["metrics"]["mae_mw"] is None
        delivery = (await client.get("/api/v1/overview?basis=delivery")).json()
        assert delivery["delivery_start"].startswith("2026-01-01")
        assert (await client.get("/api/v1/overview?month=2026-02")).status_code == 422
        for cutoff in ("25:00", "10:60", "10:00Z", "10:00:00"):
            assert (
                await client.get("/api/v1/accuracy", params={"cutoff": cutoff})
            ).status_code == 422
        assert (await client.get("/api/v1/generation?date=2026-01-15")).status_code == 200
        assert (await client.get("/api/v1/generation?date=2026-02-02")).status_code == 422
        assert (
            await client.get("/api/v1/overview?snapshot=2026-01-01T00:00:00")
        ).status_code == 422
        assert (
            await client.get("/api/v1/overview?snapshot=2099-01-01T00:00:00Z")
        ).status_code == 422
        replay = await client.get("/api/v1/overview", params={"snapshot": result["snapshot_at"]})
        assert replay.json() == result
        assert (await client.get("/api/v1/metadata")).json()["last_successful_ingestion"] is None


async def test_cors_allows_only_configured_origin(factory):
    app = create_app(Settings(cors_origins=["https://windscope.example"]), factory=factory)
    async with client_for(app) as client:
        allowed = await client.get(
            "/api/v1/health", headers={"Origin": "https://windscope.example"}
        )
        denied = await client.get("/api/v1/health", headers={"Origin": "https://untrusted.example"})
        assert allowed.headers["access-control-allow-origin"] == "https://windscope.example"
        assert "access-control-allow-origin" not in denied.headers


async def test_missing_migrations_returns_safe_unavailable(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'unmigrated.sqlite3'}")
    async with client_for(create_app(settings)) as client:
        assert (await client.get("/api/v1/health")).status_code == 503
        response = await client.get("/api/v1/overview")
        assert response.status_code == 503
        assert response.json() == {"detail": "Analysis store unavailable"}
