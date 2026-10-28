"""Opt-in, read-only checks against a running, seeded January deployment.

LIVE_API_URL=http://127.0.0.1:8000 pytest tests/test_live_api.py -q
"""

import os

import httpx
import pytest

from app.schemas.analysis import Analysis

pytestmark = pytest.mark.skipif(not os.getenv("LIVE_API_URL"), reason="Opt-in live API checks")


@pytest.fixture
def client():
    with httpx.Client(base_url=os.environ["LIVE_API_URL"], timeout=30) as connection:
        yield connection


def test_live_health_and_metadata(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    response = client.get("/api/v1/metadata")
    response.raise_for_status()
    assert response.json()["last_successful_ingestion"]
    assert response.json()["ingestion_status"].get("succeeded", 0) >= 68


@pytest.mark.parametrize(
    "basis,first,last",
    [
        ("decision", "2026-01-02", "2026-02-02"),
        ("delivery", "2026-01-01", "2026-02-01"),
    ],
)
def test_live_analysis_scope_and_cutoff(client, basis, first, last):
    response = client.get("/api/v1/overview", params={"basis": basis, "cutoff": "10:00"})
    response.raise_for_status()
    data = Analysis.model_validate(response.json())
    assert data.delivery_start.isoformat().startswith(first)
    assert data.delivery_end_exclusive.isoformat().startswith(last)
    assert data.metrics.sample_count == 744
    assert data.coverage.available_actual_halfhours == 1488
    assert data.coverage.paired_coverage_pct == 100
    assert data.coverage.evaluated_halfhours_pct == 50
    for point in data.points:
        assert point.forecast_published_at <= point.decision_cutoff


def test_live_generation_known_source_record(client):
    response = client.get("/api/v1/generation", params={"date": "2026-01-15", "cutoff": "10:00"})
    response.raise_for_status()
    data = Analysis.model_validate(response.json())
    assert len(data.points) == 24
    assert data.points[0].forecast_mw == 15828
    assert data.points[0].actual_mw == 14602
    assert data.points[0].error_mw == 1226


def test_live_accuracy_alias_and_snapshot_replay(client):
    original = client.get("/api/v1/overview").json()
    replay = client.get("/api/v1/accuracy", params={"snapshot": original["snapshot_at"]})
    replay.raise_for_status()
    assert replay.json() == original


def test_live_invalid_filters_and_cors(client):
    for path in (
        "/overview?month=2026-02",
        "/overview?cutoff=25:00",
        "/generation?date=2026-02-02",
        "/overview?snapshot=2026-01-01T00:00:00",
    ):
        assert client.get("/api/v1" + path).status_code == 422
    allowed = client.options(
        "/api/v1/overview",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = client.get("/api/v1/overview", headers={"Origin": "https://untrusted.example"})
    assert "access-control-allow-origin" not in denied.headers


def test_live_openapi_and_docs(client):
    docs = client.get("/docs")
    assert docs.status_code == 200
    assert "SwaggerUIBundle" in docs.text
    response = client.get("/openapi.json")
    response.raise_for_status()
    assert "/api/v1/generation" in response.json()["paths"]
