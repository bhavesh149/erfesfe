import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.pool import StaticPool

from app.core.db import Base, make_engine, make_session_factory
from app.services.ingestion import ingest_window


@pytest.fixture(params=["sqlite"] + (["postgres"] if os.getenv("TEST_DATABASE_URL") else []))
def factory(request):
    if request.param == "postgres":
        engine = make_engine(os.environ["TEST_DATABASE_URL"])
    else:
        from sqlalchemy import create_engine

        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    Base.metadata.create_all(engine)
    yield make_session_factory(engine)
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def record():
    def build(
        dataset="WINDFOR",
        target="2026-01-15T00:00:00Z",
        publication=None,
        generation=110,
        **extra,
    ):
        publication = publication or (
            "2026-01-15T01:00:00Z" if dataset == "FUELHH" else "2026-01-14T09:00:00Z"
        )
        row = {
            "dataset": dataset,
            "startTime": target,
            "publishTime": publication,
            "generation": generation,
        }
        if dataset == "FUELHH":
            row["fuelType"] = "WIND"
        return row | extra

    return build


@pytest.fixture
def load(factory):
    def run(rows, dataset="WINDFOR"):
        start = datetime(2025, 12, 1, tzinfo=UTC)
        return ingest_window(
            factory,
            dataset,
            start,
            start + timedelta(days=90),
            lambda *_: rows,
            "https://example.test/dataset",
        )

    return run
