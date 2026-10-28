"""Point-in-time selection; no interpolation or implied procurement advice."""

import hashlib
import math
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.db import IngestionItem, IngestionRun, Observation
from app.schemas.analysis import Analysis, Breakdown, Coverage, Metrics, Point

LONDON = ZoneInfo("Europe/London")
ALIGNMENT = "exact_start_time_hourly_v1"


def metric_values(errors: list[float]) -> Metrics:
    n = len(errors)
    return Metrics(
        sample_count=n,
        mae_mw=math.fsum(abs(x) for x in errors) / n if n else None,
        rmse_mw=math.sqrt(math.fsum(x * x for x in errors) / n) if n else None,
        bias_mw=math.fsum(errors) / n if n else None,
    )


def decision_cutoff(target: datetime, cutoff: time) -> datetime:
    decision_day = target.astimezone(LONDON).date() - timedelta(days=1)
    return datetime.combine(decision_day, cutoff, LONDON).astimezone(UTC)


def choose(rows: list[Observation], cutoff: datetime):
    eligible = [row for row in rows if row.publish_time <= cutoff]
    if not eligible:
        return None, "missing"
    latest = max(row.publish_time for row in eligible)
    candidates = [row for row in eligible if row.publish_time == latest]
    if len({row.generation_mw for row in candidates}) > 1:
        return None, "conflict"
    # Identical values with different payload metadata are semantically equivalent.
    return min(candidates, key=lambda row: row.record_hash), "available"


def visible_observations(snapshot: datetime):
    return select(Observation).where(
        Observation.first_seen_at <= snapshot,
        Observation.publish_time <= snapshot,
        select(IngestionItem.run_id)
        .join(IngestionRun, IngestionRun.id == IngestionItem.run_id)
        .where(
            IngestionItem.record_hash == Observation.record_hash,
            IngestionRun.status == "succeeded",
            IngestionRun.finished_at <= snapshot,
        )
        .exists(),
    )


def evaluate(factory, start: date, end: date, cutoff: time, snapshot: datetime) -> Analysis:
    if not 0 < (end - start).days <= 32:
        raise ValueError("Evaluation range must contain 1 to 32 delivery days")
    if snapshot.utcoffset() is None or cutoff.tzinfo is not None:
        raise ValueError("Snapshot must be aware and cutoff must be a local wall-clock time")
    begin = datetime.combine(start, time(), LONDON).astimezone(UTC)
    finish = datetime.combine(end, time(), LONDON).astimezone(UTC)
    with factory() as session:
        records = session.scalars(
            visible_observations(snapshot).where(
                Observation.start_time >= begin,
                Observation.start_time < finish,
            )
        ).all()
    by_target = defaultdict(list)
    for row in records:
        by_target[(row.dataset, row.start_time)].append(row)

    halfhours = {}
    cursor = begin
    while cursor < finish:
        halfhours[cursor] = choose(by_target[("FUELHH", cursor)], snapshot)
        cursor += timedelta(minutes=30)

    points = []
    errors_by_day = defaultdict(list)
    cursor = begin
    while cursor < finish:
        eligible_at = decision_cutoff(cursor, cutoff)
        forecast, forecast_status = choose(
            by_target[("WINDFOR", cursor)], min(eligible_at, snapshot)
        )
        actual, actual_status = halfhours[cursor]
        error = forecast.generation_mw - actual.generation_mw if forecast and actual else None
        day = cursor.astimezone(LONDON).date().isoformat()
        errors_by_day[day]  # Preserve empty days in the breakdown.
        if error is not None:
            errors_by_day[day].append(error)
        points.append(
            Point(
                start_time=cursor,
                decision_cutoff=eligible_at,
                forecast_mw=forecast.generation_mw if forecast else None,
                actual_mw=actual.generation_mw if actual else None,
                forecast_published_at=forecast.publish_time if forecast else None,
                actual_published_at=actual.publish_time if actual else None,
                forecast_hash=forecast.record_hash if forecast else None,
                actual_hash=actual.record_hash if actual else None,
                forecast_status=forecast_status,
                actual_status=actual_status,
                error_mw=error,
            )
        )
        cursor += timedelta(hours=1)

    errors = [point.error_mw for point in points if point.error_mw is not None]
    available = sum(status == "available" for _, status in halfhours.values())
    off_hour = sum(row.dataset == "WINDFOR" and row.start_time.minute != 0 for row in records)
    coverage = Coverage(
        expected_forecast_points=len(points),
        expected_actual_halfhours=len(halfhours),
        available_actual_halfhours=available,
        paired_points=len(errors),
        paired_coverage_pct=100 * len(errors) / len(points),
        actual_halfhour_coverage_pct=100 * available / len(halfhours),
        evaluated_halfhours_pct=100 * len(errors) / len(halfhours),
        missing_forecasts=sum(p.forecast_status == "missing" for p in points),
        conflicting_forecasts=sum(p.forecast_status == "conflict" for p in points),
        missing_actuals_at_forecast_times=sum(p.actual_status == "missing" for p in points),
        conflicting_actuals_at_forecast_times=sum(p.actual_status == "conflict" for p in points),
        missing_actual_halfhours=[t for t, (_, status) in halfhours.items() if status == "missing"],
        conflicting_actual_halfhours=[
            t for t, (_, status) in halfhours.items() if status == "conflict"
        ],
        off_hour_forecast_records=off_hour,
    )
    warnings = [
        "The cutoff is a configurable analysis assumption, not an asserted auction deadline.",
        "Hourly forecasts are matched to FUELHH at identical startTime only; half-past actuals "
        "are not evaluated. No hourly averaging, interpolation or energy totals are implied.",
        "The source describes metered GB wind; this is not all UK renewable generation.",
        "Actuals are retrospective outturn, not information available at the purchasing cutoff.",
    ]
    if len(errors) < len(points):
        warnings.append("Incomplete or conflicting pairs are excluded from metrics; see coverage.")
    if off_hour:
        warnings.append("Off-hour forecast records exist; the hourly alignment needs review.")
    return Analysis(
        delivery_start=begin,
        delivery_end_exclusive=finish,
        snapshot_at=snapshot,
        source_fingerprint=hashlib.sha256(
            "\n".join(sorted(row.record_hash for row in records)).encode()
        ).hexdigest(),
        policy="latest_publication_at_or_before_previous_day_cutoff_v1",
        cutoff_local=cutoff.strftime("%H:%M"),
        timezone="Europe/London",
        alignment=ALIGNMENT,
        error_definition="forecast_mw - actual_mw",
        actual_policy="latest_source_publication_visible_in_ingested_snapshot_v1",
        warnings=warnings,
        coverage=coverage,
        metrics=metric_values(errors),
        daily=[
            Breakdown(label=day, metrics=metric_values(values))
            for day, values in sorted(errors_by_day.items())
        ],
        points=points,
    )
