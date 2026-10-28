from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core.db import IngestionItem, IngestionRun, Observation
from app.services.elexon import SourceError
from app.services.ingestion import ingest_window


def test_idempotency_with_auditable_reruns(factory, load, record):
    row = record()
    assert load([row, row])["inserted"] == 1
    assert load([row])["inserted"] == 0
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Observation)) == 1
        assert session.scalar(select(func.count()).select_from(IngestionItem)) == 2
        stored = session.scalar(select(Observation))
        assert stored.payload == row
        assert stored.first_seen_at.utcoffset() == timedelta(0)


def test_revisions_are_append_only(factory, load, record):
    load([record(generation=100)])
    load([record(generation=120)])
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Observation)) == 2


def test_only_wind_actuals_are_stored(factory, load, record):
    load([record(dataset="FUELHH"), record(dataset="FUELHH", fuelType="CCGT")], "FUELHH")
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Observation)) == 1


def test_invalid_wind_fails_entire_window_and_records_failure(factory, load, record):
    with pytest.raises(ValidationError):
        load([record(), record(generation=None)])
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Observation)) == 0
        run = session.scalar(select(IngestionRun))
        assert run.status == "failed"
        assert run.rejected_count == 1
        assert run.fetched_count == 2
        assert run.error == "ValidationError"


def test_wrong_dataset_is_not_silently_ignored(factory, load, record):
    with pytest.raises(SourceError):
        load([record(dataset="FUELHH", fuelType="CCGT")])


def test_empty_window_is_visible(factory, load):
    assert load([])["inserted"] == 0
    with factory() as session:
        assert session.scalar(select(IngestionRun)).status == "empty"


def test_boundary_overlap_is_filtered(factory, record):
    start = datetime(2026, 1, 14, tzinfo=UTC)
    end = start + timedelta(days=1)
    rows = [record(publication="2026-01-14T00:00:00Z"), record(publication="2026-01-15T00:00:00Z")]
    result = ingest_window(factory, "WINDFOR", start, end, lambda *_: rows, "test")
    assert result["wind"] == 1


def test_fetch_failure_is_recorded(factory):
    def fail(*_):
        raise TimeoutError("upstream URL should not be persisted")

    start = datetime(2026, 1, 14, tzinfo=UTC)
    with pytest.raises(TimeoutError):
        ingest_window(factory, "WINDFOR", start, start + timedelta(days=1), fail, "test")
    with factory() as session:
        run = session.scalar(select(IngestionRun))
        assert run.status == "failed"
        assert run.error == "TimeoutError"
