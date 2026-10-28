from datetime import UTC, date, datetime, time

import pytest
from sqlalchemy import select

from app.analytics.evaluation import decision_cutoff, evaluate, metric_values
from app.core.db import IngestionRun, Observation


def analysis(factory, cutoff=time(10)):
    return evaluate(factory, date(2026, 1, 15), date(2026, 1, 16), cutoff, datetime.now(UTC))


def test_known_metrics_and_zero_error():
    result = metric_values([10, -20])
    assert result.sample_count == 2
    assert result.mae_mw == 15
    assert result.rmse_mw == pytest.approx(15.8113883)
    assert result.bias_mw == -5
    assert metric_values([0]).mae_mw == 0
    assert metric_values([]).mae_mw is None


def test_cutoff_inclusive_and_no_future_leak(factory, load, record):
    load(
        [
            record(generation=100, publication="2026-01-14T09:00:00Z"),
            record(generation=110, publication="2026-01-14T10:00:00Z"),
            record(generation=999, publication="2026-01-14T10:00:01Z"),
            record(generation=999, publication="2026-01-15T00:00:00Z"),
        ]
    )
    load([record(dataset="FUELHH", generation=100)], "FUELHH")
    result = analysis(factory)
    assert result.points[0].forecast_mw == 110
    assert result.metrics.bias_mw == 10
    assert result.coverage.paired_points == 1
    assert analysis(factory, time(9)).points[0].forecast_mw == 100


def test_future_only_forecast_is_missing(factory, load, record):
    load([record(publication="2026-01-14T10:01:00Z")])
    result = analysis(factory)
    assert result.points[0].forecast_status == "missing"
    assert result.metrics.sample_count == 0
    assert result.metrics.bias_mw is None


def test_latest_actual_revision_and_snapshot(factory, load, record):
    load([record()])
    load(
        [
            record(dataset="FUELHH", generation=100, publication="2026-01-15T01:00:00Z"),
            record(dataset="FUELHH", generation=120, publication="2026-01-16T01:00:00Z"),
        ],
        "FUELHH",
    )
    assert analysis(factory).points[0].actual_mw == 120
    # Simulate retrieval before either correction was published, for reproducibility.
    with factory.begin() as session:
        for row in session.scalars(select(Observation)):
            row.first_seen_at = datetime(2026, 1, 14, tzinfo=UTC)
        for run in session.scalars(select(IngestionRun)):
            run.finished_at = datetime(2026, 1, 14, tzinfo=UTC)
    past = evaluate(
        factory,
        date(2026, 1, 15),
        date(2026, 1, 16),
        time(10),
        datetime(2026, 1, 15, 12, tzinfo=UTC),
    )
    assert past.points[0].actual_mw == 100


def test_snapshot_excludes_records_not_yet_retrieved(factory, load, record):
    load([record()])
    past = evaluate(
        factory, date(2026, 1, 15), date(2026, 1, 16), time(10), datetime(2026, 1, 20, tzinfo=UTC)
    )
    assert past.points[0].forecast_status == "missing"


@pytest.mark.parametrize("dataset", ["WINDFOR", "FUELHH"])
def test_same_publication_conflict_is_excluded_without_fallback(factory, load, record, dataset):
    load(
        [
            record(dataset=dataset, generation=100),
            record(dataset=dataset, generation=200),
            record(
                dataset=dataset,
                generation=50,
                publication=(
                    "2026-01-15T00:30:00Z" if dataset == "FUELHH" else "2026-01-14T08:00:00Z"
                ),
            ),
        ],
        dataset,
    )
    result = analysis(factory)
    assert (
        getattr(result.points[0], "forecast_status" if dataset == "WINDFOR" else "actual_status")
        == "conflict"
    )
    assert result.metrics.sample_count == 0


def test_equivalent_payload_metadata_is_not_a_conflict(factory, load, record):
    load([record(), record(extraMetadata="same forecast")])
    assert analysis(factory).points[0].forecast_status == "available"


def test_no_interpolation_or_hourly_averaging(factory, load, record):
    load([record()])
    load(
        [
            record(dataset="FUELHH", generation=100),
            record(dataset="FUELHH", generation=300, target="2026-01-15T00:30:00Z"),
        ],
        "FUELHH",
    )
    result = analysis(factory)
    assert result.points[0].actual_mw == 100
    assert len(result.points) == 24
    assert result.coverage.available_actual_halfhours == 2
    assert result.coverage.expected_actual_halfhours == 48
    assert result.coverage.evaluated_halfhours_pct == pytest.approx(100 / 48)


@pytest.mark.parametrize(
    "target,expected",
    [
        ("2026-01-01T00:00:00+00:00", "2025-12-31T10:00:00+00:00"),
        ("2026-07-15T00:00:00+00:00", "2026-07-14T09:00:00+00:00"),
    ],
)
def test_uk_timezone_and_year_boundary(target, expected):
    assert decision_cutoff(datetime.fromisoformat(target), time(10)).isoformat() == expected


def test_dst_delivery_day_uses_real_elapsed_intervals(factory):
    spring = evaluate(factory, date(2026, 3, 29), date(2026, 3, 30), time(10), datetime.now(UTC))
    autumn = evaluate(factory, date(2026, 10, 25), date(2026, 10, 26), time(10), datetime.now(UTC))
    assert spring.coverage.expected_actual_halfhours == 46
    assert autumn.coverage.expected_actual_halfhours == 50


def test_zero_generation_is_a_valid_pair(factory, load, record):
    load([record(generation=0)])
    load([record(dataset="FUELHH", generation=0)], "FUELHH")
    assert analysis(factory).metrics.sample_count == 1
    assert analysis(factory).metrics.bias_mw == 0


def test_replaying_snapshot_excludes_later_ingestion(factory, load, record):
    load([record(generation=100)])
    snapshot = datetime.now(UTC)
    original = evaluate(factory, date(2026, 1, 15), date(2026, 1, 16), time(10), snapshot)
    load([record(generation=200, publication="2026-01-14T09:30:00Z")])
    replay = evaluate(factory, date(2026, 1, 15), date(2026, 1, 16), time(10), snapshot)
    assert replay.model_dump() == original.model_dump()
    assert analysis(factory).source_fingerprint != original.source_fingerprint


def test_unfinished_import_is_not_visible(factory, load, record):
    load([record()])
    with factory.begin() as session:
        session.scalar(select(IngestionRun)).status = "running"
    assert analysis(factory).points[0].forecast_status == "missing"
