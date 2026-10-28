import json
from datetime import UTC, date, datetime, time
from pathlib import Path

from app.analytics.evaluation import evaluate


def test_recorded_elexon_sample_end_to_end(factory, load):
    path = Path(__file__).resolve().parents[2] / "data/fixtures/elexon-wind.json"
    rows = json.loads(path.read_text())
    load([row for row in rows if row["dataset"] == "WINDFOR"])
    load([row for row in rows if row["dataset"] == "FUELHH"], "FUELHH")
    result = evaluate(factory, date(2026, 1, 15), date(2026, 1, 16), time(10), datetime.now(UTC))
    point = result.points[0]
    assert point.forecast_published_at.isoformat() == "2026-01-14T09:30:00+00:00"
    assert point.forecast_mw == 15828
    assert point.actual_mw == 14602
    assert point.error_mw == 1226
    assert result.metrics.mae_mw == 1226
